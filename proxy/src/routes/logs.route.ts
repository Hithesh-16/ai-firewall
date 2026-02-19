import { FastifyInstance } from "fastify";
import { listLogs } from "../logger/logger";

export async function registerLogsRoute(app: FastifyInstance): Promise<void> {
  app.get("/api/logs", async (request) => {
    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(Number(query.limit ?? 100), 500);
    const offset = Number(query.offset ?? 0);

    return {
      items: listLogs(Number.isNaN(limit) ? 100 : limit, Number.isNaN(offset) ? 0 : offset)
    };
  });
}
