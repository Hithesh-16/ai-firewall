import { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/authMiddleware";
import { getUsersByOrg } from "../auth/authService";
import {
  assignUserToOrg,
  createOrg,
  deleteOrg,
  getOrgById,
  listOrgs,
  removeUserFromOrg
} from "../org/orgService";

const createOrgSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1).regex(/^[a-z0-9-]+$/)
});

export async function registerOrgRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/orgs",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const parsed = createOrgSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
      }

      try {
        const org = createOrg(parsed.data.name, parsed.data.slug);
        return reply.status(201).send(org);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        if (message.includes("UNIQUE")) {
          return reply.status(409).send({ error: "Slug already exists" });
        }
        return reply.status(500).send({ error: message });
      }
    }
  );

  app.get(
    "/api/orgs",
    { preHandler: requireRole("admin", "security_lead") },
    async () => ({ organizations: listOrgs() })
  );

  app.get(
    "/api/orgs/:id",
    { preHandler: requireRole("admin", "security_lead") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const org = getOrgById(Number(id));
      if (!org) return reply.status(404).send({ error: "Org not found" });

      const members = getUsersByOrg(org.id).map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role
      }));

      return { ...org, members };
    }
  );

  app.post(
    "/api/orgs/:id/members",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { userId?: number };

      if (!body.userId) {
        return reply.status(400).send({ error: "userId is required" });
      }

      const org = getOrgById(Number(id));
      if (!org) return reply.status(404).send({ error: "Org not found" });

      assignUserToOrg(body.userId, org.id);
      return { ok: true };
    }
  );

  app.delete(
    "/api/orgs/:orgId/members/:userId",
    { preHandler: requireRole("admin") },
    async (request) => {
      const { userId } = request.params as { userId: string };
      removeUserFromOrg(Number(userId));
      return { ok: true };
    }
  );

  app.delete(
    "/api/orgs/:id",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const deleted = deleteOrg(Number(id));
      if (!deleted) return reply.status(404).send({ error: "Org not found" });
      return { ok: true };
    }
  );
}
