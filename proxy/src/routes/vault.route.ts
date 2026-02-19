import { FastifyInstance } from "fastify";
import { resolveToken, listTokens, purgeExpired } from "../vault/tokenVault";

export async function registerVaultRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/vault/tokens", async (_request, reply) => {
    const tokens = listTokens();
    return reply.send({ tokens });
  });

  app.post<{ Body: { tokenId: string } }>(
    "/api/vault/resolve",
    async (request, reply) => {
      const { tokenId } = request.body ?? {};
      if (!tokenId) {
        return reply.status(400).send({ error: "tokenId required" });
      }

      const resolved = resolveToken(tokenId);
      if (resolved === null) {
        return reply.status(404).send({ error: "Token not found or expired" });
      }

      return reply.send({ tokenId, originalValue: resolved });
    }
  );

  app.post("/api/vault/purge", async (_request, reply) => {
    const count = purgeExpired();
    return reply.send({ purged: count });
  });
}
