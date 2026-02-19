import db from "../db/database";
import { UsageRecord } from "../types";

type UsageRow = {
  id: number;
  log_id: number | null;
  provider_id: number;
  model_name: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost: number;
  timestamp: number;
};

function toUsageRecord(row: UsageRow): UsageRecord {
  return {
    id: row.id,
    logId: row.log_id,
    providerId: row.provider_id,
    modelName: row.model_name,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    totalTokens: row.total_tokens,
    cost: row.cost,
    timestamp: row.timestamp
  };
}

export function recordUsage(record: UsageRecord): UsageRecord {
  const stmt = db.prepare(`
    INSERT INTO usage_logs (log_id, provider_id, model_name, input_tokens, output_tokens, total_tokens, cost, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    record.logId,
    record.providerId,
    record.modelName,
    record.inputTokens,
    record.outputTokens,
    record.totalTokens,
    record.cost,
    record.timestamp
  );

  return { ...record, id: Number(result.lastInsertRowid) };
}

export function getUsageSummary(
  providerId?: number,
  startDate?: number,
  endDate?: number
): {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byModel: Array<{
    modelName: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
  byDay: Array<{ date: string; requests: number; tokens: number; cost: number }>;
} {
  let whereClause = "WHERE 1=1";
  const params: unknown[] = [];

  if (providerId !== undefined) {
    whereClause += " AND provider_id = ?";
    params.push(providerId);
  }
  if (startDate !== undefined) {
    whereClause += " AND timestamp >= ?";
    params.push(startDate);
  }
  if (endDate !== undefined) {
    whereClause += " AND timestamp <= ?";
    params.push(endDate);
  }

  const totalsRow = db
    .prepare(
      `SELECT COUNT(*) as total_requests, COALESCE(SUM(total_tokens), 0) as total_tokens, COALESCE(SUM(cost), 0) as total_cost FROM usage_logs ${whereClause}`
    )
    .get(...params) as { total_requests: number; total_tokens: number; total_cost: number };

  const byModelRows = db
    .prepare(
      `SELECT model_name, COUNT(*) as requests, SUM(total_tokens) as tokens, SUM(cost) as cost FROM usage_logs ${whereClause} GROUP BY model_name ORDER BY cost DESC`
    )
    .all(...params) as Array<{
    model_name: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;

  const byDayRows = db
    .prepare(
      `SELECT date(timestamp / 1000, 'unixepoch') as date, COUNT(*) as requests, SUM(total_tokens) as tokens, SUM(cost) as cost FROM usage_logs ${whereClause} GROUP BY date ORDER BY date DESC LIMIT 30`
    )
    .all(...params) as Array<{
    date: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;

  return {
    totalRequests: totalsRow.total_requests,
    totalTokens: totalsRow.total_tokens,
    totalCost: totalsRow.total_cost,
    byModel: byModelRows.map((r) => ({
      modelName: r.model_name,
      requests: r.requests,
      tokens: r.tokens,
      cost: r.cost
    })),
    byDay: byDayRows
  };
}

export function getRecentUsage(limit: number = 50): UsageRecord[] {
  const rows = db
    .prepare("SELECT * FROM usage_logs ORDER BY timestamp DESC LIMIT ?")
    .all(limit) as UsageRow[];
  return rows.map(toUsageRecord);
}
