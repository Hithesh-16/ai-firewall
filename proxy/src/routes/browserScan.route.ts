import { FastifyInstance } from "fastify";
import { loadPolicyConfig } from "../config";
import { evaluatePolicy } from "../policy/policyEngine";
import { redact } from "../redactor/redactor";
import { scanPII } from "../scanner/piiScanner";
import { scanSecrets } from "../scanner/secretScanner";
import { scanEntropy } from "../scanner/entropyScanner";
import { adjustSeverity } from "../scanner/contextScanner";
import { scanPromptInjection } from "../scanner/promptInjectionScanner";

interface BrowserScanBody {
  text: string;
  source?: string;
  url?: string;
}

export async function registerBrowserScanRoute(
  app: FastifyInstance
): Promise<void> {
  app.post<{ Body: BrowserScanBody }>(
    "/api/browser-scan",
    async (request, reply) => {
      const { text, source, url } = request.body ?? {};

      if (!text || typeof text !== "string") {
        return reply
          .status(400)
          .send({ error: "Missing 'text' field in request body" });
      }

      const policy = loadPolicyConfig();
      const secretResult = scanSecrets(text);
      const piiResult = scanPII(text);

      // Entropy detection
      const entropyMatches = scanEntropy(text);
      if (entropyMatches.length > 0) {
        secretResult.secrets.push(...entropyMatches);
        secretResult.hasSecrets = secretResult.secrets.length > 0;
      }

      // Context adjustments (no filePaths available in browser-scan; pass undefined)
      const contextReasons: string[] = [];
      for (const s of secretResult.secrets) {
        try {
          const adj = adjustSeverity(s.value, s.type, s.severity, undefined);
          if (adj && adj.adjustedSeverity && adj.adjustedSeverity !== s.severity) {
            s.severity = adj.adjustedSeverity;
            contextReasons.push(`${adj.reason} (${s.type})`);
          }
        } catch (e) {}
      }
      for (const p of piiResult.pii) {
        try {
          const adj = adjustSeverity(p.value, p.type, p.severity, undefined);
          if (adj && adj.adjustedSeverity && adj.adjustedSeverity !== p.severity) {
            p.severity = adj.adjustedSeverity;
            contextReasons.push(`${adj.reason} (${p.type})`);
          }
        } catch (e) {}
      }

      const decision = evaluatePolicy(secretResult, piiResult, policy);
      if (contextReasons.length > 0) {
        decision.reasons = [...new Set([...(decision.reasons ?? []), ...contextReasons])];
      }

      // Prompt-injection detection
      const piConfig = policy.prompt_injection;
      let promptInjectionScore = 0;
      if (piConfig?.enabled !== false) {
        const piResult = scanPromptInjection(text, piConfig?.threshold ?? 60);
        promptInjectionScore = piResult.score;
        if (piResult.isInjection) {
          decision.action = "BLOCK";
          decision.riskScore = Math.max(decision.riskScore, piResult.score);
          decision.reasons.push(`Prompt injection detected (score: ${piResult.score})`);
        }
      }

      let redactedText: string | undefined;
      if (decision.action === "REDACT") {
        const allMatches = [
          ...secretResult.secrets.map((s) => ({
            type: s.type,
            value: s.value
          })),
          ...piiResult.pii.map((p) => ({ type: p.type, value: p.value }))
        ];
        redactedText = redact(text, allMatches);
      }

      return reply.send({
        action: decision.action,
        riskScore: decision.riskScore,
        reasons: decision.reasons,
        secretsFound: secretResult.secrets.length,
        piiFound: piiResult.pii.length,
        secrets: secretResult.secrets.map((s) => ({
          type: s.type,
          severity: s.severity,
          position: s.position,
          length: s.length
        })),
        pii: piiResult.pii.map((p) => ({
          type: p.type,
          severity: p.severity,
          position: p.position,
          length: p.length
        })),
        redactedText,
        source: source ?? "unknown",
        url: url ?? "unknown",
        timestamp: Date.now()
      });
    }
  );
}
