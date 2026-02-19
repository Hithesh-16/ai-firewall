import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/authMiddleware";
import {
  deleteCreditLimit,
  getCreditById,
  listCredits,
  setCreditLimit,
  updateCreditLimit,
  checkCredit
} from "../gateway/creditService";

const createCreditSchema = z.object({
  providerId: z.number().int().positive(),
  modelId: z.number().int().positive().optional(),
  limitType: z.enum(["requests", "tokens", "dollars"]),
  totalLimit: z.number().positive(),
  resetPeriod: z.enum(["daily", "weekly", "monthly"]),
  hardLimit: z.boolean().optional()
});

const updateCreditSchema = z.object({
  totalLimit: z.number().positive().optional(),
  hardLimit: z.boolean().optional(),
  resetPeriod: z.enum(["daily", "weekly", "monthly"]).optional()
});

export async function registerCreditRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/credits",
    { preHandler: [requireAuth, requireRole("admin", "security_lead")] },
    async (request, reply) => {
      const parsed = createCreditSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const credit = setCreditLimit({
        providerId: parsed.data.providerId,
        modelId: parsed.data.modelId ?? null,
        limitType: parsed.data.limitType,
        totalLimit: parsed.data.totalLimit,
        resetPeriod: parsed.data.resetPeriod,
        hardLimit: parsed.data.hardLimit
      });
      return reply.status(201).send(credit);
    }
  );

  app.get(
    "/api/credits",
    { preHandler: [requireAuth] },
    async (request) => {
      const { providerId } = request.query as { providerId?: string };
      return listCredits(providerId ? Number(providerId) : undefined);
    }
  );

  app.get(
    "/api/credits/:id",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const credit = getCreditById(Number(id));
      if (!credit) {
        return reply.status(404).send({ error: "Credit limit not found" });
      }
      return credit;
    }
  );

  app.get(
    "/api/credits/status/:providerId",
    { preHandler: [requireAuth] },
    async (request) => {
      const { providerId } = request.params as { providerId: string };
      const result = checkCredit(Number(providerId));
      const credits = listCredits(Number(providerId));
      return {
        ...result,
        limits: credits.map((c) => ({
          id: c.id,
          limitType: c.limitType,
          totalLimit: c.totalLimit,
          usedAmount: c.usedAmount,
          remaining: c.totalLimit - c.usedAmount,
          resetPeriod: c.resetPeriod,
          resetDate: c.resetDate,
          hardLimit: c.hardLimit
        }))
      };
    }
  );

  app.patch(
    "/api/credits/:id",
    { preHandler: [requireAuth, requireRole("admin", "security_lead")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parsed = updateCreditSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }
      const updated = updateCreditLimit(Number(id), parsed.data);
      if (!updated) {
        return reply.status(404).send({ error: "Credit limit not found" });
      }
      return updated;
    }
  );

  app.delete(
    "/api/credits/:id",
    { preHandler: [requireAuth, requireRole("admin")] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = deleteCreditLimit(Number(id));
      if (!deleted) {
        return reply.status(404).send({ error: "Credit limit not found" });
      }
      return { success: true };
    }
  );
}
