import { FastifyInstance } from "fastify";
import { requireRole } from "../auth/authMiddleware";
import {
  exportAsCsv,
  exportAsJson,
  generateComplianceSummary
} from "../export/exportService";
import { ExportFilter } from "../types";

function parseFilter(query: Record<string, string | undefined>): ExportFilter {
  return {
    startDate: query.startDate ? Number(query.startDate) : undefined,
    endDate: query.endDate ? Number(query.endDate) : undefined,
    action: query.action as ExportFilter["action"],
    minRiskScore: query.minRiskScore ? Number(query.minRiskScore) : undefined
  };
}

export async function registerExportRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/export/json",
    { preHandler: requireRole("admin", "security_lead", "auditor") },
    async (request, reply) => {
      const filter = parseFilter(request.query as Record<string, string | undefined>);
      const data = exportAsJson(filter);

      return reply
        .header("Content-Type", "application/json")
        .header("Content-Disposition", `attachment; filename="audit-export-${Date.now()}.json"`)
        .send(data);
    }
  );

  app.get(
    "/api/export/csv",
    { preHandler: requireRole("admin", "security_lead", "auditor") },
    async (request, reply) => {
      const filter = parseFilter(request.query as Record<string, string | undefined>);
      const data = exportAsCsv(filter);

      return reply
        .header("Content-Type", "text/csv")
        .header("Content-Disposition", `attachment; filename="audit-export-${Date.now()}.csv"`)
        .send(data);
    }
  );

  app.get(
    "/api/export/compliance",
    { preHandler: requireRole("admin", "security_lead", "auditor") },
    async (request) => {
      const filter = parseFilter(request.query as Record<string, string | undefined>);
      return generateComplianceSummary(filter);
    }
  );
}
