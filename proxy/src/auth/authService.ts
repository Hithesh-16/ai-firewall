import crypto from "node:crypto";
import db from "../db/database";
import { ApiToken, Role, User } from "../types";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  const check = crypto.scryptSync(password, salt, 64).toString("hex");
  return hash === check;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function generateToken(): string {
  return `afw_${crypto.randomBytes(32).toString("hex")}`;
}

// --- User management ---

export function createUser(
  email: string,
  name: string,
  password: string,
  role: Role = "developer",
  orgId: number | null = null
): User {
  const now = Date.now();
  const passwordHash = hashPassword(password);

  const stmt = db.prepare(`
    INSERT INTO users (email, name, password_hash, role, org_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(email, name, passwordHash, role, orgId, now, now);

  return {
    id: result.lastInsertRowid as number,
    email,
    name,
    role,
    orgId,
    createdAt: now,
    updatedAt: now
  };
}

export function authenticateUser(email: string, password: string): User | null {
  const row = db.prepare(`SELECT * FROM users WHERE email = ?`).get(email) as
    | (Record<string, unknown> & { password_hash: string })
    | undefined;

  if (!row) return null;
  if (!verifyPassword(password, row.password_hash)) return null;

  return rowToUser(row);
}

export function getUserById(id: number): User | null {
  const row = db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToUser(row) : null;
}

export function getUsersByOrg(orgId: number): User[] {
  const rows = db.prepare(`SELECT * FROM users WHERE org_id = ? ORDER BY created_at`).all(orgId) as Record<string, unknown>[];
  return rows.map(rowToUser);
}

export function updateUserRole(userId: number, role: Role): void {
  db.prepare(`UPDATE users SET role = ?, updated_at = ? WHERE id = ?`).run(role, Date.now(), userId);
}

export function deleteUser(userId: number): void {
  db.prepare(`DELETE FROM users WHERE id = ?`).run(userId);
}

// --- API Token management ---

export function createApiToken(
  userId: number,
  name: string,
  expiresInDays?: number
): { token: string; record: ApiToken } {
  const raw = generateToken();
  const hashed = hashToken(raw);
  const now = Date.now();
  const expiresAt = expiresInDays ? now + expiresInDays * 86_400_000 : null;

  const stmt = db.prepare(`
    INSERT INTO api_tokens (user_id, token_hash, name, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(userId, hashed, name, now, expiresAt);

  return {
    token: raw,
    record: {
      id: result.lastInsertRowid as number,
      userId,
      tokenHash: hashed,
      name,
      lastUsedAt: null,
      createdAt: now,
      expiresAt
    }
  };
}

export function validateApiToken(raw: string): { user: User; token: ApiToken } | null {
  const hashed = hashToken(raw);
  const tokenRow = db.prepare(`SELECT * FROM api_tokens WHERE token_hash = ?`).get(hashed) as
    | Record<string, unknown>
    | undefined;

  if (!tokenRow) return null;

  const token = rowToApiToken(tokenRow);

  if (token.expiresAt && token.expiresAt < Date.now()) return null;

  const user = getUserById(token.userId);
  if (!user) return null;

  db.prepare(`UPDATE api_tokens SET last_used_at = ? WHERE id = ?`).run(Date.now(), token.id);

  return { user, token };
}

export function listApiTokens(userId: number): Array<Omit<ApiToken, "tokenHash">> {
  const rows = db.prepare(`SELECT id, user_id, name, last_used_at, created_at, expires_at FROM api_tokens WHERE user_id = ?`).all(userId) as Record<string, unknown>[];
  return rows.map((r) => ({
    id: r.id as number,
    userId: r.user_id as number,
    name: r.name as string,
    lastUsedAt: r.last_used_at as number | null,
    createdAt: r.created_at as number,
    expiresAt: r.expires_at as number | null
  }));
}

export function revokeApiToken(tokenId: number, userId: number): boolean {
  const result = db.prepare(`DELETE FROM api_tokens WHERE id = ? AND user_id = ?`).run(tokenId, userId);
  return result.changes > 0;
}

// --- Row mappers ---

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as number,
    email: row.email as string,
    name: row.name as string,
    role: row.role as Role,
    orgId: (row.org_id as number | null) ?? null,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number
  };
}

function rowToApiToken(row: Record<string, unknown>): ApiToken {
  return {
    id: row.id as number,
    userId: row.user_id as number,
    tokenHash: row.token_hash as string,
    name: row.name as string,
    lastUsedAt: (row.last_used_at as number | null) ?? null,
    createdAt: row.created_at as number,
    expiresAt: (row.expires_at as number | null) ?? null
  };
}
