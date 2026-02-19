import { FastifyInstance } from "fastify";
import { loadPolicyConfig } from "../config";
import { evaluatePolicy } from "../policy/policyEngine";
import { scanPII } from "../scanner/piiScanner";
import { scanSecrets } from "../scanner/secretScanner";
import { scanEntropy } from "../scanner/entropyScanner";

interface PermissionBody {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  filePaths?: string[];
}

export async function registerPermissionRoute(
  app: FastifyInstance
): Promise<void> {
  app.post<{ Body: PermissionBody }>(
    "/api/permission-check",
    async (request, reply) => {
      const { messages, model, filePaths } = request.body ?? {};

      if (!messages || !Array.isArray(messages)) {
        return reply.status(400).send({ error: "messages array required" });
      }

      const fullText = messages.map((m) => m.content).join("\n");
      const policy = loadPolicyConfig();
      const secretResult = scanSecrets(fullText);
      const piiResult = scanPII(fullText);
      const entropyMatches = scanEntropy(fullText);
      const decision = evaluatePolicy(secretResult, piiResult, policy);

      const requiresPermission =
        decision.action === "BLOCK" || decision.action === "REDACT";

      return reply.send({
        requiresPermission,
        decision: {
          action: decision.action,
          reasons: decision.reasons,
          riskScore: decision.riskScore
        },
        scan: {
          secretsFound: secretResult.secrets.length,
          piiFound: piiResult.pii.length,
          entropyMatches: entropyMatches.length,
          secrets: secretResult.secrets.map((s) => ({
            type: s.type,
            severity: s.severity,
            length: s.length
          })),
          pii: piiResult.pii.map((p) => ({
            type: p.type,
            severity: p.severity
          })),
          entropy: entropyMatches.map((e) => ({
            type: e.type,
            severity: e.severity,
            length: e.length
          }))
        },
        model: model ?? "unknown",
        filePaths: filePaths ?? [],
        options: requiresPermission
          ? ["allow_once", "redact_and_send", "block", "remember_for_file"]
          : ["send"],
        prompt: requiresPermission
          ? {
              title: "Sensitive Data Detected",
              message: `${decision.reasons.join(". ")}. Risk Score: ${decision.riskScore}/100`,
              secretCount: secretResult.secrets.length,
              piiCount: piiResult.pii.length
            }
          : null
      });
    }
  );
}
