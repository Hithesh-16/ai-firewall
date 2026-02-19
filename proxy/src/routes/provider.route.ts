import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/authMiddleware";
import {
  createProvider,
  deleteProvider,
  listProviders,
  getProviderById,
  updateProvider
} from "../gateway/providerService";
import { addModel, deleteModel, listModels, updateModel } from "../gateway/modelService";

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
    { preHandler: [requireAuth, requireRole("admin", "security_lead")] },
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
    { preHandler: [requireAuth] },
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
    { preHandler: [requireAuth] },
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
    { preHandler: [requireAuth, requireRole("admin", "security_lead")] },
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
    { preHandler: [requireAuth, requireRole("admin")] },
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
    { preHandler: [requireAuth, requireRole("admin", "security_lead")] },
    async (request, reply) => {
      const { providerId } = request.params as { providerId: string };
      const provider = getProviderById(Number(providerId));
      if (!provider) {
        return reply.status(404).send({ error: "Provider not found" });
      }

      const parsed = addModelSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
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
    { preHandler: [requireAuth] },
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
    { preHandler: [requireAuth] },
    async () => {
      return listModels();
    }
  );

  app.patch(
    "/api/models/:id",
    { preHandler: [requireAuth, requireRole("admin", "security_lead")] },
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
    { preHandler: [requireAuth, requireRole("admin")] },
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
