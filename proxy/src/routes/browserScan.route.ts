import { FastifyInstance } from "fastify";
import { loadPolicyConfig } from "../config";
import { evaluatePolicy } from "../policy/policyEngine";
import { redact } from "../redactor/redactor";
import { scanPII } from "../scanner/piiScanner";
import { scanSecrets } from "../scanner/secretScanner";

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
      const decision = evaluatePolicy(secretResult, piiResult, policy);

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
