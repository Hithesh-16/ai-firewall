import db from "../db/database";
import { LogEntry } from "../types";

const insertLog = db.prepare(`
INSERT INTO logs (
  timestamp,
  model,
  provider,
  original_hash,
  sanitized_text,
  secrets_found,
  pii_found,
  files_blocked,
  risk_score,
  action,
  reasons,
  response_time_ms
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function logRequest(entry: LogEntry): void {
  insertLog.run(
    entry.timestamp,
    entry.model,
    entry.provider,
    entry.originalHash,
    entry.sanitizedText,
    entry.secretsFound,
    entry.piiFound,
    entry.filesBlocked,
    entry.riskScore,
    entry.action,
    JSON.stringify(entry.reasons),
    entry.responseTimeMs
  );
}

export function listLogs(limit = 100, offset = 0): unknown[] {
  const stmt = db.prepare(`
    SELECT *
    FROM logs
    ORDER BY timestamp DESC
    LIMIT ?
    OFFSET ?
  `);
  return stmt.all(limit, offset);
}

export function listLogsPaged(limit = 100, offset = 0): { logs: unknown[]; total: number } {
  const totalStmt = db.prepare(`SELECT COUNT(*) AS count FROM logs`);
  const { count } = totalStmt.get() as { count: number };
  const stmt = db.prepare(`
    SELECT *
    FROM logs
    ORDER BY timestamp DESC
    LIMIT ?
    OFFSET ?
  `);
  const logs = stmt.all(limit, offset);
  return { logs, total: count };
}
