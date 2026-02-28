import { FastifyInstance } from "fastify";
import { scanPlugins, PluginMetadata } from "../scanner/pluginScanner";

export function registerPluginScanRoutes(app: FastifyInstance): void {
  app.post("/api/plugin-scan", async (request, reply) => {
    const body = request.body as { plugins?: PluginMetadata[] };
    if (!body?.plugins || !Array.isArray(body.plugins)) {
      return reply.status(400).send({ error: "Request body must contain a 'plugins' array" });
    }

    const results = scanPlugins(body.plugins);
    const highRisk = results.filter((r) => r.riskScore >= 50);

    return reply.send({
      total: results.length,
      highRiskCount: highRisk.length,
      results
    });
  });
}
