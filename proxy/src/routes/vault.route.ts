import { FastifyInstance } from "fastify";
import { resolveToken, listTokens, purgeExpired } from "../vault/tokenVault";
import { requireRole } from "../auth/authMiddleware";
import db from "../db/database";

export async function registerVaultRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/tokens", { preHandler: requireRole("admin") }, async (request, reply) => {
    const tokens = listTokens();
    return reply.send({ tokens });
  });

  app.post<{ Body: { tokenId: string } }>(
    "/api/vault/resolve",
    { preHandler: requireRole("admin") },
    async (request, reply) => {
      const { tokenId } = request.body ?? {};
      if (!tokenId) {
        return reply.status(400).send({ error: "tokenId required" });
      }

      const resolved = resolveToken(tokenId);
      if (resolved === null) {
        return reply.status(404).send({ error: "Token not found or expired" });
      }

      // Audit the resolve action
      try {
        const userId = (request as any).authContext?.user?.id ?? null;
        db.prepare(`INSERT INTO admin_audit (timestamp, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
          Date.now(),
          userId,
          "vault_resolve",
          JSON.stringify({ tokenId })
        );
      } catch (e) {
        // ignore audit failures
      }

      return reply.send({ tokenId, originalValue: resolved });
    }
  );

  app.post("/api/vault/purge", { preHandler: requireRole("admin") }, async (request, reply) => {
    const count = purgeExpired();
    try {
      const userId = (request as any).authContext?.user?.id ?? null;
      db.prepare(`INSERT INTO admin_audit (timestamp, user_id, action, details) VALUES (?, ?, ?, ?)`).run(
        Date.now(),
        userId,
        "vault_purge",
        JSON.stringify({ purged: count })
      );
    } catch (e) {}
    return reply.send({ purged: count });
  });
}
