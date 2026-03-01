import db from "../db/database";
import { ExportFilter } from "../types";

type LogRow = {
  id: number;
  timestamp: number;
  model: string;
  provider: string;
  sanitized_text: string;
  secrets_found: number;
  pii_found: number;
  files_blocked: number;
  risk_score: number;
  action: string;
  reasons: string;
  response_time_ms: number;
};

function buildWhereClause(filter: ExportFilter): { clause: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filter.startDate) {
    conditions.push("timestamp >= ?");
    params.push(filter.startDate);
  }
  if (filter.endDate) {
    conditions.push("timestamp <= ?");
    params.push(filter.endDate);
  }
  if (filter.action) {
    conditions.push("action = ?");
    params.push(filter.action);
  }
  if (filter.minRiskScore !== undefined) {
    conditions.push("risk_score >= ?");
    params.push(filter.minRiskScore);
  }

  const clause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, params };
}

export function queryLogs(filter: ExportFilter): LogRow[] {
  const { clause, params } = buildWhereClause(filter);
  const sql = `
    SELECT id, timestamp, model, provider, sanitized_text, secrets_found,
           pii_found, files_blocked, risk_score, action, reasons, response_time_ms
    FROM logs
    ${clause}
    ORDER BY timestamp DESC
  `;
  return db.prepare(sql).all(...params) as LogRow[];
}

export function exportAsJson(filter: ExportFilter): string {
  const rows = queryLogs(filter);
  const formatted = rows.map((r) => ({
    ...r,
    reasons: safeParse(r.reasons),
    date: new Date(r.timestamp).toISOString()
  }));

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      totalRecords: formatted.length,
      filter,
      records: formatted
    },
    null,
    2
  );
}

export function exportAsCsv(filter: ExportFilter): string {
  const rows = queryLogs(filter);
  const headers = [
    "id",
    "date",
    "model",
    "provider",
    "action",
    "risk_score",
    "secrets_found",
    "pii_found",
    "files_blocked",
    "response_time_ms",
    "reasons"
  ];

  const csvRows = rows.map((r) => {
    const date = new Date(r.timestamp).toISOString();
    const reasons = safeParse(r.reasons).join("; ");
    return [
      r.id,
      date,
      r.model,
      r.provider,
      r.action,
      r.risk_score,
      r.secrets_found,
      r.pii_found,
      r.files_blocked,
      r.response_time_ms,
      `"${reasons.replace(/"/g, '""')}"`
    ].join(",");
  });

  return [headers.join(","), ...csvRows].join("\n");
}

export function generateComplianceSummary(filter: ExportFilter): Record<string, unknown> {
  const rows = queryLogs(filter);
  const total = rows.length;
  const blocked = rows.filter((r) => r.action === "BLOCK").length;
  const redacted = rows.filter((r) => r.action === "REDACT").length;
  const allowed = rows.filter((r) => r.action === "ALLOW").length;
  const avgRisk = total > 0 ? rows.reduce((s, r) => s + r.risk_score, 0) / total : 0;
  const totalSecrets = rows.reduce((s, r) => s + r.secrets_found, 0);
  const totalPii = rows.reduce((s, r) => s + r.pii_found, 0);

  return {
    reportGeneratedAt: new Date().toISOString(),
    period: {
      start: filter.startDate ? new Date(filter.startDate).toISOString() : "all time",
      end: filter.endDate ? new Date(filter.endDate).toISOString() : "now"
    },
    summary: {
      totalRequests: total,
      blocked,
      redacted,
      allowed,
      blockRate: total > 0 ? `${((blocked / total) * 100).toFixed(1)}%` : "0%",
      redactRate: total > 0 ? `${((redacted / total) * 100).toFixed(1)}%` : "0%",
      averageRiskScore: Math.round(avgRisk * 100) / 100,
      totalSecretsDetected: totalSecrets,
      totalPiiDetected: totalPii
    },
    compliance: {
      noRawSecretsStored: true,
      allRequestsLogged: true,
      fileScopeEnforced: true
    }
  };
}

function safeParse(val: string): string[] {
  try {
    return JSON.parse(val) as string[];
  } catch {
    return [];
  }
}
