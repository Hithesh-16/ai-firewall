import crypto from "node:crypto";
import axios from "axios";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadPolicyConfig, isStrictLocal } from "../config";
import { consumeCredit } from "../gateway/creditService";
import {
  extractTokenUsage,
  formatAnthropicPayload,
  formatGeminiPayload,
  legacyFallback,
  normalizeAnthropicResponse,
  normalizeGeminiResponse,
  resolveGatewayRoute
} from "../gateway/gatewayRouter";
import { recordUsage } from "../gateway/usageService";
import { logRequest } from "../logger/logger";
import { evaluatePolicy } from "../policy/policyEngine";
import { mergeProjectPolicy } from "../policy/projectPolicy";
import { redact } from "../redactor/redactor";
import {
  formatOllamaPayload,
  normalizeOllamaResponse,
  resolveRoute
} from "../router/smartRouter";
import { scanPII } from "../scanner/piiScanner";
import { scanSecrets } from "../scanner/secretScanner";
import { scanEntropy } from "../scanner/entropyScanner";
import { adjustSeverity } from "../scanner/contextScanner";
import { scanPromptInjection } from "../scanner/promptInjectionScanner";
import { evaluateModelPolicy } from "../policy/modelPolicy";
import { validateFilePaths } from "../scope/fileScope";
import { ChatCompletionRequest } from "../types";

const chatSchema = z.object({
  model: z.string(),
  messages: z.array(
    z.object({
      role: z.string(),
      content: z.string()
    })
  ),
  metadata: z
    .object({
      filePaths: z.array(z.string()).optional(),
      projectRoot: z.string().optional()
    })
    .optional()
});

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function mergeMessages(messages: Array<{ content: string }>): string {
  return messages.map((m) => m.content).join("\n");
}

function isAnthropicProvider(slug: string): boolean {
  return slug.includes("anthropic") || slug.includes("claude");
}

function isGeminiProvider(slug: string): boolean {
  return slug.includes("google") || slug.includes("gemini");
}

export async function registerAiRoute(app: FastifyInstance): Promise<void> {
  app.post("/v1/chat/completions", async (request, reply) => {
    const startedAt = Date.now();
    const parsed = chatSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid request payload",
        details: parsed.error.flatten()
      });
    }

    const payload = parsed.data as ChatCompletionRequest & {
      metadata?: { projectRoot?: string };
    };

    // --- Policy evaluation (unchanged from Phase 1-3) ---
    const globalPolicy = loadPolicyConfig();
    const policy = mergeProjectPolicy(globalPolicy, payload.metadata?.projectRoot);

    const rawText = mergeMessages(payload.messages);
    const fileScopeResults = validateFilePaths(
      payload.metadata?.filePaths,
      policy.file_scope
    );

    const secretResult = scanSecrets(rawText);
    const piiResult = scanPII(rawText);

    // Entropy-based detection: merge HIGH_ENTROPY matches into secretResult
    const entropyMatches = scanEntropy(rawText);
    if (entropyMatches.length > 0) {
      secretResult.secrets.push(...entropyMatches);
      secretResult.hasSecrets = secretResult.secrets.length > 0;
    }

    // Context-aware severity adjustments (based on file paths / placeholders)
    const contextReasons: string[] = [];
    const filePaths = payload.metadata?.filePaths;

    for (const s of secretResult.secrets) {
      try {
        const adj = adjustSeverity(s.value, s.type, s.severity, filePaths);
        if (adj && adj.adjustedSeverity && adj.adjustedSeverity !== s.severity) {
          s.severity = adj.adjustedSeverity;
          contextReasons.push(`${adj.reason} (${s.type})`);
        }
      } catch (e) {
        // ignore context adjustment errors
      }
    }

    for (const p of piiResult.pii) {
      try {
        const adj = adjustSeverity(p.value, p.type, p.severity, filePaths);
        if (adj && adj.adjustedSeverity && adj.adjustedSeverity !== p.severity) {
          p.severity = adj.adjustedSeverity;
          contextReasons.push(`${adj.reason} (${p.type})`);
        }
      } catch (e) {
        // ignore
      }
    }

    const decision = evaluatePolicy(secretResult, piiResult, policy, fileScopeResults);
    if (contextReasons.length > 0) {
      decision.reasons = [...new Set([...(decision.reasons ?? []), ...contextReasons])];
    }

    // Prompt-injection detection
    const piConfig = policy.prompt_injection;
    if (piConfig?.enabled !== false) {
      const piResult = scanPromptInjection(rawText, piConfig?.threshold ?? 60);
      if (piResult.isInjection) {
        decision.action = "BLOCK";
        decision.riskScore = Math.max(decision.riskScore, piResult.score);
        decision.reasons.push(`Prompt injection detected (score: ${piResult.score})`);
      }
    }

    // --- BLOCK ---
    if (decision.action === "BLOCK") {
      logRequest({
        timestamp: Date.now(),
        model: payload.model,
        provider: "—",
        originalHash: hashText(rawText),
        sanitizedText: "[BLOCKED]",
        secretsFound: secretResult.secrets.length,
        piiFound: piiResult.pii.length,
        filesBlocked: decision.filesBlocked.length,
        riskScore: decision.riskScore,
        action: "BLOCK",
        reasons: decision.reasons,
        responseTimeMs: Date.now() - startedAt
      });

      if (decision.filesBlocked.length > 0) {
        return reply.status(403).send({
          error: "Request blocked by file scope policy",
          code: "FILE_SCOPE_BLOCKED",
          reasons: decision.reasons,
          files_blocked: decision.filesBlocked
        });
      }

      return reply.status(403).send({
        error: "Request blocked due to sensitive data",
        code: "FIREWALL_BLOCKED",
        reasons: decision.reasons,
        risk_score: decision.riskScore
      });
    }

    // --- Try Phase 4 gateway routing first ---
    const gatewayRoute = resolveGatewayRoute(payload.model);

    // --- Smart routing (Phase 2) as secondary layer ---
    const smartRoute = resolveRoute(decision.riskScore, payload.model, policy);
    const shouldRedact =
      decision.action === "REDACT" || smartRoute.requiresRedaction;

    const redactionInput = [
      ...secretResult.secrets.map((s) => ({ type: s.type, value: s.value })),
      ...piiResult.pii.map((p) => ({ type: p.type, value: p.value }))
    ];

    let sanitizedText = rawText;
    let outboundMessages = payload.messages;

    if (shouldRedact && redactionInput.length > 0) {
      sanitizedText = redact(rawText, redactionInput);
      outboundMessages = payload.messages.map((message) => ({
        ...message,
        content: redact(message.content, redactionInput)
      }));
    }

    // Per-model policy enforcement
    const modelPolicies = policy.model_policies;
    if (modelPolicies) {
      const mpResult = evaluateModelPolicy(payload.model, payload.metadata?.filePaths, modelPolicies);
      if (!mpResult.allowed) {
        return reply.status(403).send({
          error: mpResult.reason,
          code: "MODEL_POLICY_BLOCKED",
          blockedFiles: mpResult.blockedFiles
        });
      }
    }

    // === GATEWAY PATH: provider is registered in Phase 4 system ===
    if (gatewayRoute) {
      if (!gatewayRoute.creditCheck.allowed) {
        return reply.status(429).send({
          error: "Credit limit exhausted",
          code: "CREDIT_EXHAUSTED",
          details: gatewayRoute.creditCheck.message,
          limit_type: gatewayRoute.creditCheck.limitType,
          remaining: 0
        });
      }

      const providerSlug = gatewayRoute.provider.slug;

      try {
        let requestPayload: unknown;
        let headers: Record<string, string> = { "Content-Type": "application/json" };
        let rawResponseData: Record<string, unknown>;
        let normalizedData: Record<string, unknown>;

        const wantsStream =
          (request.headers.accept as string | undefined)?.includes("text/event-stream") ||
          (request.body as any)?.stream === true;

        if (gatewayRoute.isLocal) {
          requestPayload = formatOllamaPayload(
            gatewayRoute.model.modelName,
            outboundMessages
          );
          if (wantsStream) {
            // Stream from local Ollama and pipe to client
            const resp = await axios.post(gatewayRoute.providerUrl, requestPayload, {
              headers,
              responseType: "stream",
              timeout: 0
            });
            reply.raw.writeHead(resp.status, resp.headers as any);
            (resp.data as any).pipe(reply.raw);
            return reply;
          } else {
            const resp = await axios.post(gatewayRoute.providerUrl, requestPayload, { headers, timeout: 120_000 });
            rawResponseData = resp.data as Record<string, unknown>;
            normalizedData = normalizeOllamaResponse(rawResponseData) as Record<string, unknown>;
          }
        } else if (isAnthropicProvider(providerSlug)) {
          requestPayload = formatAnthropicPayload(
            gatewayRoute.model.modelName,
            outboundMessages
          );
          headers["x-api-key"] = gatewayRoute.decryptedKey;
          headers["anthropic-version"] = "2023-06-01";
          if (wantsStream) {
            const resp = await axios.post(gatewayRoute.providerUrl, requestPayload, {
              headers,
              responseType: "stream",
              timeout: 0
            });
            reply.raw.writeHead(resp.status, resp.headers as any);
            (resp.data as any).pipe(reply.raw);
            return reply;
          } else {
            const resp = await axios.post(gatewayRoute.providerUrl, requestPayload, { headers });
            rawResponseData = resp.data as Record<string, unknown>;
            normalizedData = normalizeAnthropicResponse(rawResponseData) as Record<string, unknown>;
          }
        } else if (isGeminiProvider(providerSlug)) {
          requestPayload = formatGeminiPayload(outboundMessages);
          const url = `${gatewayRoute.providerUrl}?key=${gatewayRoute.decryptedKey}`;
          if (wantsStream) {
            const resp = await axios.post(url, requestPayload, { headers, responseType: "stream", timeout: 0 });
            reply.raw.writeHead(resp.status, resp.headers as any);
            (resp.data as any).pipe(reply.raw);
            return reply;
          } else {
            const resp = await axios.post(url, requestPayload, { headers });
            rawResponseData = resp.data as Record<string, unknown>;
            normalizedData = normalizeGeminiResponse(rawResponseData) as Record<string, unknown>;
          }
        } else {
          requestPayload = {
            model: gatewayRoute.model.modelName,
            messages: outboundMessages
          };
          headers["Authorization"] = `Bearer ${gatewayRoute.decryptedKey}`;
          if (wantsStream) {
            const resp = await axios.post(gatewayRoute.providerUrl, requestPayload, { headers, responseType: "stream", timeout: 0 });
            reply.raw.writeHead(resp.status, resp.headers as any);
            (resp.data as any).pipe(reply.raw);
            return reply;
          } else {
            const resp = await axios.post(gatewayRoute.providerUrl, requestPayload, { headers });
            rawResponseData = resp.data as Record<string, unknown>;
            normalizedData = rawResponseData;
          }
        }

        const elapsed = Date.now() - startedAt;
        const tokenUsage = extractTokenUsage(providerSlug, rawResponseData);
        const cost =
          (tokenUsage.inputTokens / 1000) * gatewayRoute.model.inputCostPer1k +
          (tokenUsage.outputTokens / 1000) * gatewayRoute.model.outputCostPer1k;

        consumeCredit(gatewayRoute.provider.id, 1, "requests", gatewayRoute.model.id);
        if (tokenUsage.totalTokens > 0) {
          consumeCredit(
            gatewayRoute.provider.id,
            tokenUsage.totalTokens,
            "tokens",
            gatewayRoute.model.id
          );
        }

        recordUsage({
          logId: null,
          providerId: gatewayRoute.provider.id,
          modelName: gatewayRoute.model.modelName,
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          totalTokens: tokenUsage.totalTokens,
          cost,
          timestamp: Date.now()
        });

        logRequest({
          timestamp: Date.now(),
          model: gatewayRoute.model.modelName,
          provider: gatewayRoute.provider.name,
          originalHash: hashText(rawText),
          sanitizedText,
          secretsFound: secretResult.secrets.length,
          piiFound: piiResult.pii.length,
          filesBlocked: 0,
          riskScore: decision.riskScore,
          action: shouldRedact ? "REDACT" : "ALLOW",
          reasons: decision.reasons,
          responseTimeMs: elapsed
        });

        return {
          ...normalizedData,
          _firewall: {
            action: shouldRedact ? "REDACT" : "ALLOW",
            secrets_found: secretResult.secrets.length,
            pii_found: piiResult.pii.length,
            files_blocked: 0,
            risk_score: decision.riskScore,
            routed_to: gatewayRoute.provider.name,
            model_used: gatewayRoute.model.modelName,
            tokens_used: tokenUsage.totalTokens,
            cost_estimate: Math.round(cost * 1_000_000) / 1_000_000,
            credit_remaining: gatewayRoute.creditCheck.remaining
          }
        };
      } catch (error) {
        const message = axios.isAxiosError(error)
          ? error.response?.data ?? error.message
          : "Unknown provider error";

        logRequest({
          timestamp: Date.now(),
          model: gatewayRoute.model.modelName,
          provider: gatewayRoute.provider.name,
          originalHash: hashText(rawText),
          sanitizedText,
          secretsFound: secretResult.secrets.length,
          piiFound: piiResult.pii.length,
          filesBlocked: 0,
          riskScore: decision.riskScore,
          action: shouldRedact ? "REDACT" : "ALLOW",
          reasons: [`Provider error: ${JSON.stringify(message)}`],
          responseTimeMs: Date.now() - startedAt
        });

        return reply.status(502).send({
          error: "Upstream provider request failed",
          provider: gatewayRoute.provider.name,
          details: message
        });
      }
    }

    // STRICT_LOCAL: if no local gateway route was found and strict_local is on, block
    if (isStrictLocal()) {
      return reply.status(403).send({
        error: "STRICT_LOCAL mode is enabled — only local LLM providers are allowed. No local provider found for this model.",
        code: "STRICT_LOCAL_ENFORCED"
      });
    }

    // === LEGACY PATH: no gateway provider found — use Phase 1-2 env-based routing ===
    const legacy = legacyFallback(
      payload.model,
      request.headers.authorization?.replace("Bearer ", "")
    );

    if (smartRoute.isLocal) {
      try {
        const ollamaPayload = formatOllamaPayload(smartRoute.model, outboundMessages);
        const ollamaResponse = await axios.post(smartRoute.providerUrl, ollamaPayload, {
          headers: { "Content-Type": "application/json" },
          timeout: 120_000
        });
        const providerData = normalizeOllamaResponse(
          ollamaResponse.data as Record<string, unknown>
        ) as Record<string, unknown>;

        const elapsed = Date.now() - startedAt;
        logRequest({
          timestamp: Date.now(),
          model: smartRoute.model,
          provider: "local",
          originalHash: hashText(rawText),
          sanitizedText,
          secretsFound: secretResult.secrets.length,
          piiFound: piiResult.pii.length,
          filesBlocked: 0,
          riskScore: decision.riskScore,
          action: shouldRedact ? "REDACT" : "ALLOW",
          reasons: decision.reasons,
          responseTimeMs: elapsed
        });

        return {
          ...providerData,
          _firewall: {
            action: shouldRedact ? "REDACT" : "ALLOW",
            secrets_found: secretResult.secrets.length,
            pii_found: piiResult.pii.length,
            files_blocked: 0,
            risk_score: decision.riskScore,
            routed_to: "local_llm",
            model_used: smartRoute.model
          }
        };
      } catch (error) {
        const message = axios.isAxiosError(error)
          ? error.response?.data ?? error.message
          : "Local LLM error";
        return reply.status(502).send({ error: "Local LLM request failed", details: message });
      }
    }

    if (!legacy.apiKey) {
      return reply.status(400).send({
        error:
          "No provider configured for this model. Register a provider via POST /api/providers, or set OPENAI_API_KEY in .env for legacy mode."
      });
    }

    try {
      const cloudPayload = { model: smartRoute.model, messages: outboundMessages };
      const cloudResponse = await axios.post(legacy.providerUrl, cloudPayload, {
        headers: {
          Authorization: `Bearer ${legacy.apiKey}`,
          "Content-Type": "application/json"
        }
      });
      const providerData = cloudResponse.data as Record<string, unknown>;
      const elapsed = Date.now() - startedAt;

      logRequest({
        timestamp: Date.now(),
        model: smartRoute.model,
        provider: "openai",
        originalHash: hashText(rawText),
        sanitizedText,
        secretsFound: secretResult.secrets.length,
        piiFound: piiResult.pii.length,
        filesBlocked: 0,
        riskScore: decision.riskScore,
        action: shouldRedact ? "REDACT" : "ALLOW",
        reasons: decision.reasons,
        responseTimeMs: elapsed
      });

      return {
        ...providerData,
        _firewall: {
          action: shouldRedact ? "REDACT" : "ALLOW",
          secrets_found: secretResult.secrets.length,
          pii_found: piiResult.pii.length,
          files_blocked: 0,
          risk_score: decision.riskScore,
          routed_to: smartRoute.target,
          model_used: smartRoute.model
        }
      };
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data ?? error.message
        : "Unknown provider error";

      logRequest({
        timestamp: Date.now(),
        model: smartRoute.model,
        provider: "openai",
        originalHash: hashText(rawText),
        sanitizedText,
        secretsFound: secretResult.secrets.length,
        piiFound: piiResult.pii.length,
        filesBlocked: 0,
        riskScore: decision.riskScore,
        action: shouldRedact ? "REDACT" : "ALLOW",
        reasons: [`Provider error: ${JSON.stringify(message)}`],
        responseTimeMs: Date.now() - startedAt
      });

      return reply.status(502).send({
        error: "Upstream provider request failed",
        details: message
      });
    }
  });
}
