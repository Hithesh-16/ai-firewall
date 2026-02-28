import { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadPolicyConfig } from "../config";
import { checkCredit } from "../gateway/creditService";
import { findModelByName } from "../gateway/modelService";
import { getProviderById } from "../gateway/providerService";
import { evaluatePolicy } from "../policy/policyEngine";
import { mergeProjectPolicy } from "../policy/projectPolicy";
import { scanPII } from "../scanner/piiScanner";
import { scanSecrets } from "../scanner/secretScanner";
import { scanEntropy } from "../scanner/entropyScanner";
import { adjustSeverity } from "../scanner/contextScanner";
import { scanPromptInjection } from "../scanner/promptInjectionScanner";
import { evaluateModelPolicy } from "../policy/modelPolicy";
import { analyzeBlindMi } from "../audit/blindMi";
import { githubSearch } from "../tools/githubSearch";
import { validateFilePaths } from "../scope/fileScope";

const estimateSchema = z.object({
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function registerEstimateRoute(app: FastifyInstance): Promise<void> {
  app.post("/api/estimate", async (request, reply) => {
    const parsed = estimateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const { model, messages, metadata } = parsed.data;

    const globalPolicy = loadPolicyConfig();
    const policy = mergeProjectPolicy(globalPolicy, metadata?.projectRoot);

    const rawText = messages.map((m) => m.content).join("\n");
    const fileScopeResults = validateFilePaths(metadata?.filePaths, policy.file_scope);

    const secretResult = scanSecrets(rawText);
    const piiResult = scanPII(rawText);

    // Entropy-based detection
    const entropyMatches = scanEntropy(rawText);
    if (entropyMatches.length > 0) {
      secretResult.secrets.push(...entropyMatches);
      secretResult.hasSecrets = secretResult.secrets.length > 0;
    }

    // Context adjustments
    const contextReasons: string[] = [];
    const filePaths = metadata?.filePaths;
    for (const s of secretResult.secrets) {
      try {
        const adj = adjustSeverity(s.value, s.type, s.severity, filePaths);
        if (adj && adj.adjustedSeverity && adj.adjustedSeverity !== s.severity) {
          s.severity = adj.adjustedSeverity;
          contextReasons.push(`${adj.reason} (${s.type})`);
        }
      } catch (e) {}
    }
    for (const p of piiResult.pii) {
      try {
        const adj = adjustSeverity(p.value, p.type, p.severity, filePaths);
        if (adj && adj.adjustedSeverity && adj.adjustedSeverity !== p.severity) {
          p.severity = adj.adjustedSeverity;
          contextReasons.push(`${adj.reason} (${p.type})`);
        }
      } catch (e) {}
    }

    const decision = evaluatePolicy(secretResult, piiResult, policy, fileScopeResults);
    if (contextReasons.length > 0) {
      decision.reasons = [...new Set([...(decision.reasons ?? []), ...contextReasons])];
    }

    // Per-model policy enforcement
    const modelPolicies = policy.model_policies;
    let modelPolicyBlocked: { reason?: string; blockedFiles: string[] } | undefined;
    if (modelPolicies) {
      const mpResult = evaluateModelPolicy(model, metadata?.filePaths, modelPolicies);
      if (!mpResult.allowed) {
        decision.action = "BLOCK";
        decision.reasons.push(mpResult.reason ?? "Model policy blocked");
        modelPolicyBlocked = { reason: mpResult.reason, blockedFiles: mpResult.blockedFiles };
      }
    }

    // Prompt-injection detection
    const piConfig = policy.prompt_injection;
    let promptInjection: { score: number; isInjection: boolean; matches: Array<{ pattern: string; matched: string }> } | undefined;
    if (piConfig?.enabled !== false) {
      const piResult = scanPromptInjection(rawText, piConfig?.threshold ?? 60);
      promptInjection = { score: piResult.score, isInjection: piResult.isInjection, matches: piResult.matches.map(m => ({ pattern: m.pattern, matched: m.matched })) };
      if (piResult.isInjection) {
        decision.action = "BLOCK";
        decision.riskScore = Math.max(decision.riskScore, piResult.score);
        decision.reasons.push(`Prompt injection detected (score: ${piResult.score})`);
      }
    }

    // Optional privacy audit (opt-in)
    let privacyRisk: { blindMiScore?: number; githubHits?: number; privacyRiskScore?: number } | undefined = undefined;
    try {
      if (policy.audit && policy.audit.enabled) {
        const blind = analyzeBlindMi(rawText);
        let ghHits = 0;
        if (policy.audit.useSurrogateModel && blind.blindMiScore >= (policy.audit.privacyRiskThreshold ?? 0.5)) {
          // perform lightweight GitHub search using first candidate
          if (blind.candidates.length > 0) {
            const q = encodeURIComponent(blind.candidates[0]);
            const gh = await githubSearch(q);
            ghHits = gh.hitCount ?? 0;
          }
        }
        const combined = Math.min(1, blind.blindMiScore + (ghHits > 0 ? 0.3 : 0));
        privacyRisk = { blindMiScore: blind.blindMiScore, githubHits: ghHits, privacyRiskScore: Math.round(combined * 100) / 100 };
      }
    } catch (e) {
      // best-effort
    }

    const estimatedInputTokens = estimateTokens(rawText);

    const registeredModel = findModelByName(model);
    let providerName = "unknown";
    let estimatedCost = 0;
    let creditRemaining: number = Infinity;
    let creditLimitType = "none";

    if (registeredModel) {
      const provider = getProviderById(registeredModel.providerId);
      providerName = provider?.name ?? "unknown";
      estimatedCost =
        (estimatedInputTokens / 1000) * registeredModel.inputCostPer1k;

      const credit = checkCredit(registeredModel.providerId, registeredModel.id);
      creditRemaining = credit.remaining;
      creditLimitType = credit.limitType;
    }

    return {
      estimatedInputTokens,
      estimatedCost: Math.round(estimatedCost * 1_000_000) / 1_000_000,
      creditRemaining: creditRemaining === Infinity ? -1 : creditRemaining,
      creditLimitType,
      scan: {
        action: decision.action,
        secretsFound: secretResult.secrets.length,
        piiFound: piiResult.pii.length,
        filesBlocked: decision.filesBlocked,
        riskScore: decision.riskScore,
        reasons: decision.reasons
      },
      modelPolicyBlocked,
      promptInjection,
      privacyRisk,
      model: {
        name: registeredModel?.modelName ?? model,
        displayName: registeredModel?.displayName ?? model,
        provider: providerName,
        registered: registeredModel !== null
      }
    };
  });
}
