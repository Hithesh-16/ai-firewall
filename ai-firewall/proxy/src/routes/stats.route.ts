import { FastifyInstance } from "fastify";
import db from "../db/database";

export async function registerStatsRoute(app: FastifyInstance): Promise<void> {
  app.get("/api/stats", async () => {
    const totals = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN action = 'BLOCK' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN action = 'REDACT' THEN 1 ELSE 0 END) as redacted,
        SUM(CASE WHEN action = 'ALLOW' THEN 1 ELSE 0 END) as allowed,
        COALESCE(AVG(risk_score), 0) as avg_risk_score
      FROM logs
    `).get() as { total: number; blocked: number; redacted: number; allowed: number; avg_risk_score: number };

    const byDay = db.prepare(`
      SELECT
        DATE(timestamp / 1000, 'unixepoch') as date,
        COUNT(*) as count
      FROM logs
      GROUP BY date
      ORDER BY date DESC
      LIMIT 30
    `).all() as Array<{ date: string; count: number }>;

    const reasonRows = db.prepare(`
      SELECT reasons
      FROM logs
      WHERE reasons IS NOT NULL AND reasons != '[]'
    `).all() as Array<{ reasons: string }>;

    const secretCounts: Record<string, number> = {};
    for (const row of reasonRows) {
      try {
        const parsed = JSON.parse(row.reasons) as string[];
        for (const reason of parsed) {
          secretCounts[reason] = (secretCounts[reason] ?? 0) + 1;
        }
      } catch {
        continue;
      }
    }

    return {
      totalRequests: totals.total,
      blocked: totals.blocked,
      redacted: totals.redacted,
      allowed: totals.allowed,
      avgRiskScore: Math.round(totals.avg_risk_score * 100) / 100,
      secretsByType: secretCounts,
      requestsByDay: byDay
    };
  });

  app.get("/api/risk-score", async () => {
    const row = db.prepare(`
      SELECT COALESCE(AVG(risk_score), 0) as avg, COALESCE(MAX(risk_score), 0) as max
      FROM logs
      WHERE timestamp > ?
    `).get(Date.now() - 7 * 24 * 60 * 60 * 1000) as { avg: number; max: number };

    const score = Math.round(100 - row.avg);
    return {
      projectSafetyScore: Math.max(0, Math.min(100, score)),
      avgRiskScore: Math.round(row.avg * 100) / 100,
      maxRiskScore: row.max,
      period: "7d"
    };
  });
}
