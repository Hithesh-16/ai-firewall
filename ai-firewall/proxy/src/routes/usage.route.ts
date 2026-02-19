import { FastifyInstance } from "fastify";
import { requireAuth, requireRole } from "../auth/authMiddleware";
import { getRecentUsage, getUsageSummary } from "../gateway/usageService";

export async function registerUsageRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/usage/summary",
    { preHandler: [requireAuth, requireRole("admin", "security_lead", "auditor")] },
    async (request) => {
      const { providerId, startDate, endDate } = request.query as {
        providerId?: string;
        startDate?: string;
        endDate?: string;
      };

      return getUsageSummary(
        providerId ? Number(providerId) : undefined,
        startDate ? Number(startDate) : undefined,
        endDate ? Number(endDate) : undefined
      );
    }
  );

  app.get(
    "/api/usage/recent",
    { preHandler: [requireAuth, requireRole("admin", "security_lead", "auditor")] },
    async (request) => {
      const { limit } = request.query as { limit?: string };
      return getRecentUsage(limit ? Number(limit) : 50);
    }
  );
}
