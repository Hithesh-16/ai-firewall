import { FastifyInstance } from "fastify";
import { z } from "zod";
import { loadPolicyConfig, savePolicyConfig } from "../config";

const updatePolicySchema = z.object({
  version: z.string(),
  rules: z.object({
    block_private_keys: z.boolean(),
    block_aws_keys: z.boolean(),
    block_db_urls: z.boolean(),
    block_github_tokens: z.boolean(),
    redact_emails: z.boolean(),
    redact_phone: z.boolean(),
    redact_jwt: z.boolean(),
    redact_generic_api_keys: z.boolean(),
    allow_source_code: z.boolean(),
    log_all_requests: z.boolean()
  }),
  file_scope: z.object({
    mode: z.enum(["blocklist", "allowlist"]),
    blocklist: z.array(z.string()),
    allowlist: z.array(z.string()),
    max_file_size_kb: z.number(),
    scan_on_open: z.boolean(),
    scan_on_send: z.boolean()
  }),
  blocked_paths: z.array(z.string()),
  severity_threshold: z.enum(["critical", "high", "medium"])
});

const updateScopeSchema = z.object({
  mode: z.enum(["blocklist", "allowlist"]),
  blocklist: z.array(z.string()),
  allowlist: z.array(z.string()),
  max_file_size_kb: z.number(),
  scan_on_open: z.boolean(),
  scan_on_send: z.boolean()
});

export async function registerPolicyRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/policy", async () => loadPolicyConfig());

  app.put("/api/policy", async (request, reply) => {
    const parsed = updatePolicySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid policy payload",
        details: parsed.error.flatten()
      });
    }
    savePolicyConfig(parsed.data);
    return { ok: true, policy: parsed.data };
  });

  app.get("/api/file-scope", async () => {
    const policy = loadPolicyConfig();
    return { file_scope: policy.file_scope };
  });

  app.put("/api/file-scope", async (request, reply) => {
    const parsed = updateScopeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid file scope payload",
        details: parsed.error.flatten()
      });
    }
    const policy = loadPolicyConfig();
    policy.file_scope = parsed.data;
    savePolicyConfig(policy);
    return { ok: true, file_scope: policy.file_scope };
  });
}
