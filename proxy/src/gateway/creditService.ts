import db from "../db/database";
import { CreditCheck, CreditConfig, LimitType, ResetPeriod } from "../types";

type CreditRow = {
  id: number;
  provider_id: number | null;
  model_id: number | null;
  limit_type: string;
  total_limit: number;
  used_amount: number;
  reset_period: string;
  reset_date: number;
  hard_limit: number;
  created_at: number;
};

function toCredit(row: CreditRow): CreditConfig {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelId: row.model_id,
    limitType: row.limit_type as LimitType,
    totalLimit: row.total_limit,
    usedAmount: row.used_amount,
    resetPeriod: row.reset_period as ResetPeriod,
    resetDate: row.reset_date,
    hardLimit: row.hard_limit === 1,
    createdAt: row.created_at
  };
}

function computeNextReset(period: ResetPeriod): number {
  const now = new Date();
  switch (period) {
    case "daily":
      now.setDate(now.getDate() + 1);
      now.setHours(0, 0, 0, 0);
      return now.getTime();
    case "weekly":
      now.setDate(now.getDate() + (7 - now.getDay()));
      now.setHours(0, 0, 0, 0);
      return now.getTime();
    case "monthly":
      now.setMonth(now.getMonth() + 1, 1);
      now.setHours(0, 0, 0, 0);
      return now.getTime();
  }
}

export function setCreditLimit(opts: {
  providerId: number | null;
  modelId?: number | null;
  limitType: LimitType;
  totalLimit: number;
  resetPeriod: ResetPeriod;
  hardLimit?: boolean;
}): CreditConfig {
  const now = Date.now();
  const resetDate = computeNextReset(opts.resetPeriod);

  const stmt = db.prepare(`
    INSERT INTO credits (provider_id, model_id, limit_type, total_limit, used_amount, reset_period, reset_date, hard_limit, created_at)
    VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    opts.providerId,
    opts.modelId ?? null,
    opts.limitType,
    opts.totalLimit,
    opts.resetPeriod,
    resetDate,
    opts.hardLimit !== false ? 1 : 0,
    now
  );

  return getCreditById(Number(result.lastInsertRowid))!;
}

export function getCreditById(id: number): CreditConfig | null {
  const row = db.prepare("SELECT * FROM credits WHERE id = ?").get(id) as CreditRow | undefined;
  return row ? toCredit(row) : null;
}

export function listCredits(providerId?: number): CreditConfig[] {
  if (providerId !== undefined) {
    const rows = db
      .prepare("SELECT * FROM credits WHERE provider_id = ? ORDER BY id")
      .all(providerId) as CreditRow[];
    return rows.map(toCredit);
  }
  return (db.prepare("SELECT * FROM credits ORDER BY id").all() as CreditRow[]).map(toCredit);
}

function resetIfExpired(credit: CreditRow): void {
  if (Date.now() >= credit.reset_date) {
    const nextReset = computeNextReset(credit.reset_period as ResetPeriod);
    db.prepare("UPDATE credits SET used_amount = 0, reset_date = ? WHERE id = ?").run(
      nextReset,
      credit.id
    );
    credit.used_amount = 0;
    credit.reset_date = nextReset;
  }
}

export function checkCredit(providerId: number, modelId?: number): CreditCheck {
  const rows = db
    .prepare(
      "SELECT * FROM credits WHERE (provider_id = ? OR provider_id IS NULL) AND (model_id = ? OR model_id IS NULL)"
    )
    .all(providerId, modelId ?? null) as CreditRow[];

  if (rows.length === 0) {
    return { allowed: true, remaining: Infinity, limitType: "requests" };
  }

  for (const row of rows) {
    resetIfExpired(row);

    const remaining = row.total_limit - row.used_amount;
    if (remaining <= 0 && row.hard_limit === 1) {
      return {
        allowed: false,
        remaining: 0,
        limitType: row.limit_type as LimitType,
        message: `${row.limit_type} limit exhausted (${row.used_amount}/${row.total_limit})`
      };
    }
  }

  const tightest = rows.reduce((min, row) => {
    const rem = row.total_limit - row.used_amount;
    const minRem = min.total_limit - min.used_amount;
    return rem < minRem ? row : min;
  }, rows[0]);

  return {
    allowed: true,
    remaining: tightest.total_limit - tightest.used_amount,
    limitType: tightest.limit_type as LimitType
  };
}

export function consumeCredit(
  providerId: number,
  amount: number,
  limitType: LimitType,
  modelId?: number
): void {
  const rows = db
    .prepare(
      "SELECT * FROM credits WHERE limit_type = ? AND (provider_id = ? OR provider_id IS NULL) AND (model_id = ? OR model_id IS NULL)"
    )
    .all(limitType, providerId, modelId ?? null) as CreditRow[];

  for (const row of rows) {
    resetIfExpired(row);
    db.prepare("UPDATE credits SET used_amount = used_amount + ? WHERE id = ?").run(
      amount,
      row.id
    );
  }
}

export function updateCreditLimit(
  id: number,
  updates: { totalLimit?: number; hardLimit?: boolean; resetPeriod?: ResetPeriod }
): CreditConfig | null {
  const credit = getCreditById(id);
  if (!credit) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.totalLimit !== undefined) {
    fields.push("total_limit = ?");
    values.push(updates.totalLimit);
  }
  if (updates.hardLimit !== undefined) {
    fields.push("hard_limit = ?");
    values.push(updates.hardLimit ? 1 : 0);
  }
  if (updates.resetPeriod !== undefined) {
    fields.push("reset_period = ?", "reset_date = ?");
    values.push(updates.resetPeriod, computeNextReset(updates.resetPeriod));
  }

  if (fields.length === 0) return credit;

  values.push(id);
  db.prepare(`UPDATE credits SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  return getCreditById(id);
}

export function deleteCreditLimit(id: number): boolean {
  return db.prepare("DELETE FROM credits WHERE id = ?").run(id).changes > 0;
}
