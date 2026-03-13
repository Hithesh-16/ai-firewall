import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuthOrLocalhost, requireRoleOnly } from "../auth/authMiddleware";
import {
  createProvider,
  deleteProvider,
  listProviders,
  getProviderById,
  updateProvider
} from "../gateway/providerService";
import { resolveGatewayRoute } from "../gateway/gatewayRouter";
import { addModel, deleteModel, listModels, updateModel } from "../gateway/modelService";

// ── Live model catalog ──────────────────────────────────────────────────
// Pricing in USD per 1k tokens — updated March 2026
export const MODEL_CATALOG: Array<{
  name: string;
  slug: string;
  baseUrl: string;
  authUrl: string;
  description: string;
  models: Array<{
    modelName: string;
    displayName: string;
    inputCostPer1k: number;
    outputCostPer1k: number;
    maxContextTokens: number;
    tags?: string[];
  }>;
}> = [
  {
    name: "OpenAI",
    slug: "openai",
    baseUrl: "https://api.openai.com/v1",
    authUrl: "https://platform.openai.com/api-keys",
    description: "GPT-4o, o3, o1 reasoning models",
    models: [
      { modelName: "gpt-4o", displayName: "GPT-4o", inputCostPer1k: 0.005, outputCostPer1k: 0.015, maxContextTokens: 128000, tags: ["fast", "vision"] },
      { modelName: "gpt-4o-mini", displayName: "GPT-4o mini", inputCostPer1k: 0.00015, outputCostPer1k: 0.0006, maxContextTokens: 128000, tags: ["fast", "cheap"] },
      { modelName: "o3-mini", displayName: "o3-mini", inputCostPer1k: 0.0011, outputCostPer1k: 0.0044, maxContextTokens: 200000, tags: ["reasoning"] },
      { modelName: "o1", displayName: "o1", inputCostPer1k: 0.015, outputCostPer1k: 0.06, maxContextTokens: 200000, tags: ["reasoning"] },
      { modelName: "gpt-4-turbo", displayName: "GPT-4 Turbo", inputCostPer1k: 0.01, outputCostPer1k: 0.03, maxContextTokens: 128000 }
    ]
  },
  {
    name: "Anthropic",
    slug: "anthropic",
    baseUrl: "https://api.anthropic.com",
    authUrl: "https://console.anthropic.com/settings/keys",
    description: "Claude 4 Opus, Sonnet, Haiku",
    models: [
      { modelName: "claude-opus-4-6", displayName: "Claude Opus 4.6", inputCostPer1k: 0.015, outputCostPer1k: 0.075, maxContextTokens: 200000, tags: ["powerful"] },
      { modelName: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", inputCostPer1k: 0.003, outputCostPer1k: 0.015, maxContextTokens: 200000, tags: ["fast", "balanced"] },
      { modelName: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5", inputCostPer1k: 0.0008, outputCostPer1k: 0.004, maxContextTokens: 200000, tags: ["cheap", "fast"] },
      { modelName: "claude-opus-4-5", displayName: "Claude Opus 4.5", inputCostPer1k: 0.015, outputCostPer1k: 0.075, maxContextTokens: 200000, tags: ["powerful"] },
      { modelName: "claude-sonnet-4-5", displayName: "Claude Sonnet 4.5", inputCostPer1k: 0.003, outputCostPer1k: 0.015, maxContextTokens: 200000 }
    ]
  },
  {
    name: "Google Gemini",
    slug: "google-gemini",
    baseUrl: "https://generativelanguage.googleapis.com",
    authUrl: "https://aistudio.google.com/app/apikey",
    description: "Gemini 2.5 Pro, Flash — 1M context",
    models: [
      { modelName: "gemini-2.5-pro-preview-03-25", displayName: "Gemini 2.5 Pro", inputCostPer1k: 0.00125, outputCostPer1k: 0.01, maxContextTokens: 1048576, tags: ["powerful", "long-ctx"] },
      { modelName: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", inputCostPer1k: 0.0001, outputCostPer1k: 0.0004, maxContextTokens: 1048576, tags: ["fast", "cheap", "long-ctx"] },
      { modelName: "gemini-2.0-flash-lite", displayName: "Gemini 2.0 Flash Lite", inputCostPer1k: 0.000075, outputCostPer1k: 0.0003, maxContextTokens: 1048576, tags: ["cheapest"] },
      { modelName: "gemini-1.5-pro", displayName: "Gemini 1.5 Pro", inputCostPer1k: 0.00125, outputCostPer1k: 0.005, maxContextTokens: 2000000, tags: ["long-ctx"] },
      { modelName: "gemini-1.5-flash", displayName: "Gemini 1.5 Flash", inputCostPer1k: 0.000075, outputCostPer1k: 0.0003, maxContextTokens: 1048576, tags: ["fast"] }
    ]
  },
  {
    name: "Groq",
    slug: "groq",
    baseUrl: "https://api.groq.com/openai/v1",
    authUrl: "https://console.groq.com/keys",
    description: "Ultra-fast Llama, Mixtral inference — free tier",
    models: [
      { modelName: "llama-3.3-70b-versatile", displayName: "Llama 3.3 70B", inputCostPer1k: 0.00059, outputCostPer1k: 0.00079, maxContextTokens: 128000, tags: ["fast"] },
      { modelName: "llama-3.1-8b-instant", displayName: "Llama 3.1 8B", inputCostPer1k: 0.00005, outputCostPer1k: 0.00008, maxContextTokens: 128000, tags: ["cheapest", "fast"] },
      { modelName: "mixtral-8x7b-32768", displayName: "Mixtral 8x7B", inputCostPer1k: 0.00024, outputCostPer1k: 0.00024, maxContextTokens: 32768 },
      { modelName: "gemma2-9b-it", displayName: "Gemma 2 9B", inputCostPer1k: 0.0002, outputCostPer1k: 0.0002, maxContextTokens: 8192 },
      { modelName: "deepseek-r1-distill-llama-70b", displayName: "DeepSeek R1 Distill 70B", inputCostPer1k: 0.00075, outputCostPer1k: 0.00099, maxContextTokens: 128000, tags: ["reasoning"] }
    ]
  },
  {
    name: "Mistral AI",
    slug: "mistral",
    baseUrl: "https://api.mistral.ai/v1",
    authUrl: "https://console.mistral.ai/api-keys",
    description: "Mistral Large, Codestral for code",
    models: [
      { modelName: "mistral-large-latest", displayName: "Mistral Large", inputCostPer1k: 0.002, outputCostPer1k: 0.006, maxContextTokens: 128000 },
      { modelName: "mistral-small-latest", displayName: "Mistral Small", inputCostPer1k: 0.0002, outputCostPer1k: 0.0006, maxContextTokens: 128000, tags: ["cheap"] },
      { modelName: "codestral-latest", displayName: "Codestral", inputCostPer1k: 0.0003, outputCostPer1k: 0.0009, maxContextTokens: 256000, tags: ["code"] },
      { modelName: "mistral-nemo", displayName: "Mistral Nemo 12B", inputCostPer1k: 0.00013, outputCostPer1k: 0.00013, maxContextTokens: 128000, tags: ["cheap"] },
      { modelName: "pixtral-large-latest", displayName: "Pixtral Large", inputCostPer1k: 0.002, outputCostPer1k: 0.006, maxContextTokens: 128000, tags: ["vision"] }
    ]
  },
  {
    name: "x.ai (Grok)",
    slug: "xai",
    baseUrl: "https://api.x.ai/v1",
    authUrl: "https://console.x.ai",
    description: "Grok 3 with real-time knowledge",
    models: [
      { modelName: "grok-3", displayName: "Grok 3", inputCostPer1k: 0.003, outputCostPer1k: 0.015, maxContextTokens: 131072, tags: ["powerful"] },
      { modelName: "grok-3-mini", displayName: "Grok 3 Mini", inputCostPer1k: 0.0003, outputCostPer1k: 0.0005, maxContextTokens: 131072, tags: ["fast", "cheap"] },
      { modelName: "grok-2-1212", displayName: "Grok 2", inputCostPer1k: 0.002, outputCostPer1k: 0.01, maxContextTokens: 131072 }
    ]
  },
  {
    name: "DeepSeek",
    slug: "deepseek",
    baseUrl: "https://api.deepseek.com/v1",
    authUrl: "https://platform.deepseek.com/api_keys",
    description: "DeepSeek V3 Chat, R1 Reasoner",
    models: [
      { modelName: "deepseek-chat", displayName: "DeepSeek V3 Chat", inputCostPer1k: 0.00027, outputCostPer1k: 0.0011, maxContextTokens: 64000, tags: ["cheap"] },
      { modelName: "deepseek-reasoner", displayName: "DeepSeek R1 Reasoner", inputCostPer1k: 0.00055, outputCostPer1k: 0.00219, maxContextTokens: 64000, tags: ["reasoning"] }
    ]
  },
  {
    name: "Together AI",
    slug: "together",
    baseUrl: "https://api.together.xyz/v1",
    authUrl: "https://api.together.ai/settings/api-keys",
    description: "Open-source models, fast and cheap",
    models: [
      { modelName: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", displayName: "Llama 3.1 70B Turbo", inputCostPer1k: 0.00088, outputCostPer1k: 0.00088, maxContextTokens: 131072, tags: ["fast"] },
      { modelName: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", displayName: "Llama 3.1 8B Turbo", inputCostPer1k: 0.00018, outputCostPer1k: 0.00018, maxContextTokens: 131072, tags: ["cheap", "fast"] },
      { modelName: "deepseek-ai/DeepSeek-V3", displayName: "DeepSeek V3", inputCostPer1k: 0.00135, outputCostPer1k: 0.00135, maxContextTokens: 128000 },
      { modelName: "Qwen/QwQ-32B", displayName: "QwQ 32B", inputCostPer1k: 0.0012, outputCostPer1k: 0.0012, maxContextTokens: 32768, tags: ["reasoning"] },
      { modelName: "mistralai/Mixtral-8x22B-Instruct-v0.1", displayName: "Mixtral 8x22B", inputCostPer1k: 0.0012, outputCostPer1k: 0.0012, maxContextTokens: 65536 }
    ]
  },
  {
    name: "Perplexity",
    slug: "perplexity",
    baseUrl: "https://api.perplexity.ai",
    authUrl: "https://www.perplexity.ai/settings/api",
    description: "Sonar with real-time web search",
    models: [
      { modelName: "sonar-pro", displayName: "Sonar Pro", inputCostPer1k: 0.003, outputCostPer1k: 0.015, maxContextTokens: 200000, tags: ["search"] },
      { modelName: "sonar", displayName: "Sonar", inputCostPer1k: 0.001, outputCostPer1k: 0.001, maxContextTokens: 128000, tags: ["search", "cheap"] },
      { modelName: "sonar-reasoning", displayName: "Sonar Reasoning", inputCostPer1k: 0.001, outputCostPer1k: 0.005, maxContextTokens: 128000, tags: ["reasoning", "search"] }
    ]
  },
  {
    name: "Ollama (Local)",
    slug: "ollama",
    baseUrl: "http://localhost:11434",
    authUrl: "https://ollama.com/download",
    description: "Run models locally — 100% private, free",
    models: [
      { modelName: "llama3.2", displayName: "Llama 3.2 3B", inputCostPer1k: 0, outputCostPer1k: 0, maxContextTokens: 128000, tags: ["free", "local"] },
      { modelName: "llama3.2:1b", displayName: "Llama 3.2 1B", inputCostPer1k: 0, outputCostPer1k: 0, maxContextTokens: 128000, tags: ["free", "local"] },
      { modelName: "qwen2.5-coder:7b", displayName: "Qwen 2.5 Coder 7B", inputCostPer1k: 0, outputCostPer1k: 0, maxContextTokens: 32768, tags: ["code", "free", "local"] },
      { modelName: "phi4", displayName: "Phi-4 14B", inputCostPer1k: 0, outputCostPer1k: 0, maxContextTokens: 16384, tags: ["free", "local"] },
      { modelName: "mistral", displayName: "Mistral 7B", inputCostPer1k: 0, outputCostPer1k: 0, maxContextTokens: 32768, tags: ["free", "local"] },
      { modelName: "deepseek-r1:7b", displayName: "DeepSeek R1 7B", inputCostPer1k: 0, outputCostPer1k: 0, maxContextTokens: 32768, tags: ["reasoning", "free", "local"] }
    ]
  }
];

const createProviderSchema = z.object({
  name: z.string().min(1),
  apiKey: z.string().min(1),
  baseUrl: z.string().url()
});

const updateProviderSchema = z.object({
  name: z.string().min(1).optional(),
  apiKey: z.string().min(1).optional(),
  baseUrl: z.string().url().optional(),
  enabled: z.boolean().optional()
});

const addModelSchema = z.object({
  modelName: z.string().min(1),
  displayName: z.string().optional(),
  inputCostPer1k: z.number().min(0).optional(),
  outputCostPer1k: z.number().min(0).optional(),
  maxContextTokens: z.number().int().min(0).optional()
});

const updateModelSchema = z.object({
  displayName: z.string().optional(),
  inputCostPer1k: z.number().min(0).optional(),
  outputCostPer1k: z.number().min(0).optional(),
  maxContextTokens: z.number().int().min(0).optional(),
  enabled: z.boolean().optional()
});

export async function registerProviderRoutes(app: FastifyInstance): Promise<void> {
  // --- Providers ---

  app.post(
    "/api/providers",
    { preHandler: [requireAuthOrLocalhost, requireRoleOnly("admin", "security_lead", "developer")] },
    async (request, reply) => {
      const parsed = createProviderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      try {
        const provider = createProvider(parsed.data.name, parsed.data.apiKey, parsed.data.baseUrl);
        return reply.status(201).send({
          id: provider.id,
          name: provider.name,
          slug: provider.slug,
          baseUrl: provider.baseUrl,
          enabled: provider.enabled,
          createdAt: provider.createdAt
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("UNIQUE constraint")) {
          return reply.status(409).send({ error: "Provider with this name already exists" });
        }
        return reply.status(500).send({ error: msg });
      }
    }
  );

  app.get(
    "/api/providers",
    { preHandler: [requireAuthOrLocalhost] },
    async () => {
      const providers = listProviders();
      return providers.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        baseUrl: p.baseUrl,
        enabled: p.enabled,
        createdAt: p.createdAt
      }));
    }
  );

  app.get(
    "/api/providers/:id",
    { preHandler: [requireAuthOrLocalhost] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const provider = getProviderById(Number(id));
      if (!provider) {
        return reply.status(404).send({ error: "Provider not found" });
      }
      return {
        id: provider.id,
        name: provider.name,
        slug: provider.slug,
        baseUrl: provider.baseUrl,
        enabled: provider.enabled,
        createdAt: provider.createdAt,
        updatedAt: provider.updatedAt
      };
    }
  );

  app.patch(
    "/api/providers/:id",
    { preHandler: [requireAuthOrLocalhost, requireRoleOnly("admin", "security_lead", "developer")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateProviderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const updated = updateProvider(Number(id), parsed.data);
      if (!updated) {
        return reply.status(404).send({ error: "Provider not found" });
      }
      return {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        baseUrl: updated.baseUrl,
        enabled: updated.enabled,
        updatedAt: updated.updatedAt
      };
    }
  );

  app.delete(
    "/api/providers/:id",
    { preHandler: [requireAuthOrLocalhost, requireRoleOnly("admin", "security_lead", "developer")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = deleteProvider(Number(id));
      if (!deleted) {
        return reply.status(404).send({ error: "Provider not found" });
      }
      return { success: true };
    }
  );

  // --- Models ---

  app.post(
    "/api/providers/:providerId/models",
    { preHandler: [requireAuthOrLocalhost, requireRoleOnly("admin", "security_lead", "developer")] },
    async (request, reply) => {
      const { providerId } = request.params as { providerId: string };
      const provider = getProviderById(Number(providerId));
      if (!provider) {
        return reply.status(404).send({ error: "Provider not found" });
      }

      const slug = provider.slug.toLowerCase();
      const isLocal = slug.includes("ollama") || slug === "local";

      const parsed = addModelSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      // If not local, only allow models that exist in the global MODEL_CATALOG
      if (!isLocal) {
        const isKnownModel = MODEL_CATALOG.some(p =>
          p.models.some(m => m.modelName === parsed.data.modelName)
        );
        if (!isKnownModel) {
          return reply.status(403).send({ error: "Manual model creation is only allowed for local providers (like Ollama). For cloud providers, please select a model from the catalog." });
        }
      }

      const allModels = listModels();
      const duplicate = allModels.find((m) => m.modelName === parsed.data.modelName);
      if (duplicate) {
        const dupProvider = getProviderById(duplicate.providerId);
        return reply.status(409).send({ error: `A model with the name "${parsed.data.modelName}" already exists on provider "${dupProvider?.name ?? "Unknown"}". Duplicate model names are not allowed.` });
      }

      try {
        const model = addModel(Number(providerId), parsed.data.modelName, {
          displayName: parsed.data.displayName,
          inputCostPer1k: parsed.data.inputCostPer1k,
          outputCostPer1k: parsed.data.outputCostPer1k,
          maxContextTokens: parsed.data.maxContextTokens
        });
        return reply.status(201).send(model);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (msg.includes("UNIQUE constraint")) {
          return reply.status(409).send({ error: "Model already exists for this provider" });
        }
        return reply.status(500).send({ error: msg });
      }
    }
  );

  app.get(
    "/api/providers/:providerId/models",
    { preHandler: [requireAuthOrLocalhost] },
    async (request, reply) => {
      const { providerId } = request.params as { providerId: string };
      const provider = getProviderById(Number(providerId));
      if (!provider) {
        return reply.status(404).send({ error: "Provider not found" });
      }
      return listModels(Number(providerId));
    }
  );

  app.get(
    "/api/models",
    { preHandler: [requireAuthOrLocalhost] },
    async () => {
      const models = listModels();
      return models.map((m) => ({
        ...m,
        registered: resolveGatewayRoute(m.modelName) !== null
      }));
    }
  );

  // Model catalog: all known providers + models with pricing
  app.get(
    "/api/models/catalog",
    { preHandler: [requireAuthOrLocalhost] },
    async () => {
      return MODEL_CATALOG;
    }
  );

  app.patch(
    "/api/models/:id",
    { preHandler: [requireAuthOrLocalhost, requireRoleOnly("admin", "security_lead", "developer")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateModelSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const updated = updateModel(Number(id), parsed.data);
      if (!updated) {
        return reply.status(404).send({ error: "Model not found" });
      }
      return updated;
    }
  );

  app.delete(
    "/api/models/:id",
    { preHandler: [requireAuthOrLocalhost, requireRoleOnly("admin", "security_lead", "developer")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = deleteModel(Number(id));
      if (!deleted) {
        return reply.status(404).send({ error: "Model not found" });
      }
      return { success: true };
    }
  );
}
