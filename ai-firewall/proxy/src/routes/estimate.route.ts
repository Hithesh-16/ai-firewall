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
    const decision = evaluatePolicy(secretResult, piiResult, policy, fileScopeResults);

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
      model: {
        name: registeredModel?.modelName ?? model,
        displayName: registeredModel?.displayName ?? model,
        provider: providerName,
        registered: registeredModel !== null
      }
    };
  });
}
