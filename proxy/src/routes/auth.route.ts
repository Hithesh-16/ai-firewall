import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  authenticateUser,
  createApiToken,
  createUser,
  listApiTokens,
  revokeApiToken
} from "../auth/authService";
import { requireAuth, requireRole } from "../auth/authMiddleware";

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  role: z.enum(["admin", "security_lead", "developer", "auditor"]).optional()
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string()
});

const tokenCreateSchema = z.object({
  name: z.string().min(1),
  expiresInDays: z.number().positive().optional()
});

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    try {
      const user = createUser(
        parsed.data.email,
        parsed.data.name,
        parsed.data.password,
        parsed.data.role ?? "developer"
      );
      const { token } = createApiToken(user.id, "default");

      return reply.status(201).send({
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        token
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.includes("UNIQUE constraint")) {
        return reply.status(409).send({ error: "Email already registered" });
      }
      return reply.status(500).send({ error: message });
    }
  });

  app.post("/api/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const user = authenticateUser(parsed.data.email, parsed.data.password);
    if (!user) {
      return reply.status(401).send({ error: "Invalid email or password" });
    }

    const { token } = createApiToken(user.id, "session");

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token
    };
  });

  app.get("/api/auth/me", { preHandler: requireAuth }, async (request) => {
    const ctx = request.authContext!;
    return {
      user: {
        id: ctx.user.id,
        email: ctx.user.email,
        name: ctx.user.name,
        role: ctx.user.role,
        orgId: ctx.user.orgId
      }
    };
  });

  app.post("/api/auth/tokens", { preHandler: requireAuth }, async (request, reply) => {
    const parsed = tokenCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }

    const ctx = request.authContext!;
    const { token, record } = createApiToken(ctx.user.id, parsed.data.name, parsed.data.expiresInDays);

    return reply.status(201).send({
      token,
      id: record.id,
      name: record.name,
      expiresAt: record.expiresAt
    });
  });

  app.get("/api/auth/tokens", { preHandler: requireAuth }, async (request) => {
    const ctx = request.authContext!;
    return { tokens: listApiTokens(ctx.user.id) };
  });

  app.delete("/api/auth/tokens/:id", { preHandler: requireAuth }, async (request, reply) => {
    const ctx = request.authContext!;
    const { id } = request.params as { id: string };
    const revoked = revokeApiToken(Number(id), ctx.user.id);

    if (!revoked) {
      return reply.status(404).send({ error: "Token not found" });
    }
    return { ok: true };
  });

  // Admin: manage users
  app.get(
    "/api/admin/users",
    { preHandler: requireRole("admin", "security_lead") },
    async () => {
      const { default: db } = await import("../db/database");
      const rows = db.prepare(`
        SELECT id, email, name, role, org_id, created_at FROM users ORDER BY created_at
      `).all();
      return { users: rows };
    }
  );

  app.put(
    "/api/admin/users/:id/role",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as { role?: string };
      const validRoles = ["admin", "security_lead", "developer", "auditor"];

      if (!body.role || !validRoles.includes(body.role)) {
        return reply.status(400).send({ error: "Invalid role", validRoles });
      }

      const { updateUserRole } = await import("../auth/authService");
      updateUserRole(Number(id), body.role as "admin" | "security_lead" | "developer" | "auditor");
      return { ok: true };
    }
  );
}
