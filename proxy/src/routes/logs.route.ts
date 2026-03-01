import { FastifyInstance } from "fastify";
import { listLogsPaged } from "../logger/logger";

export async function registerLogsRoute(app: FastifyInstance): Promise<void> {
  app.get("/api/logs", async (request) => {
    const query = request.query as { limit?: string; offset?: string; page?: string };
    const limit = Math.min(Number(query.limit ?? 100), 500);
    const page = Math.max(Number(query.page ?? 1), 1);
    const offset = Number(query.offset ?? (page - 1) * limit);

    const { logs, total } = listLogsPaged(Number.isNaN(limit) ? 100 : limit, Number.isNaN(offset) ? 0 : offset);

    return {
      logs,
      total,
      page,
      limit: Number(limit)
    };
  });
}
