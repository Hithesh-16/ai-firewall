import { FastifyInstance } from "fastify";
import db from "../db/database";
import { requireRole } from "../auth/authMiddleware";

export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  // Enqueue audit candidate (admin or system)
  app.post<{ Body: { snippet_masked: string; metadata?: Record<string, unknown>; blindmi_score?: number; github_hits?: number } }>(
    "/api/audit/queue",
    { preHandler: requireRole("developer", "security_lead", "admin") },
    async (request, reply) => {
      const { snippet_masked, metadata, blindmi_score = 0, github_hits = 0 } = request.body ?? {};
      if (!snippet_masked) return reply.status(400).send({ error: "snippet_masked required" });
      const submitterId = (request as any).authContext?.user?.id ?? null;
      const stmt = db.prepare(
        `INSERT INTO audit_queue (created_at, submitter_id, snippet_masked, metadata, blindmi_score, github_hits, status) VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      const info = stmt.run(Date.now(), submitterId, snippet_masked, JSON.stringify(metadata ?? {}), blindmi_score, github_hits, "pending");
      return reply.send({ id: info.lastInsertRowid });
    }
  );

  // List audit queue (admin)
  app.get("/api/audit/queue", { preHandler: requireRole("admin", "security_lead") }, async (request, reply) => {
    const rows = db.prepare(`SELECT * FROM audit_queue ORDER BY created_at DESC LIMIT 200`).all();
    return reply.send({ items: rows });
  });

  // Action on audit candidate (admin)
  app.post<{ Body: { id: number; action: "approve" | "redact" | "block" | "false_positive"; notes?: string } }>(
    "/api/audit/action",
    { preHandler: requireRole("admin", "security_lead") },
    async (request, reply) => {
      const { id, action, notes } = request.body ?? {};
      if (!id || !action) return reply.status(400).send({ error: "id and action required" });
      const reviewerId = (request as any).authContext?.user?.id ?? null;
      db.prepare(`UPDATE audit_queue SET status = ?, reviewer_id = ?, reviewed_at = ?, action = ?, notes = ? WHERE id = ?`).run(
        action,
        reviewerId,
        Date.now(),
        action,
        notes ?? null,
        id
      );
      return reply.send({ ok: true });
    }
  );
}

