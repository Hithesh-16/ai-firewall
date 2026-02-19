import crypto from "node:crypto";
import db from "../db/database";
import { env } from "../config";

function ensureTable(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_vault (
      token_id   TEXT PRIMARY KEY,
      encrypted  TEXT NOT NULL,
      iv         TEXT NOT NULL,
      tag        TEXT NOT NULL,
      type       TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    )
  `);
}

let tableReady = false;

function init(): void {
  if (!tableReady) {
    ensureTable();
    tableReady = true;
  }
}

function getMasterKey(): Buffer {
  const raw = env.MASTER_KEY ?? "default-dev-key-change-in-production!!";
  return crypto.createHash("sha256").update(raw).digest();
}

function encrypt(plaintext: string): { encrypted: string; iv: string; tag: string } {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return {
    encrypted,
    iv: iv.toString("hex"),
    tag: tag.toString("hex")
  };
}

function decrypt(encrypted: string, iv: string, tag: string): string {
  const key = getMasterKey();
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(iv, "hex")
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function storeToken(
  originalValue: string,
  type: string,
  ttlSeconds?: number
): string {
  init();
  const tokenId = `VAULT_TOK_${crypto.randomBytes(6).toString("hex")}`;
  const { encrypted, iv, tag } = encrypt(originalValue);
  const now = Date.now();
  const expiresAt = ttlSeconds ? now + ttlSeconds * 1000 : null;

  db.prepare(
    `INSERT INTO token_vault (token_id, encrypted, iv, tag, type, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(tokenId, encrypted, iv, tag, type, now, expiresAt);

  return `[${tokenId}]`;
}

export function resolveToken(tokenId: string): string | null {
  init();
  const clean = tokenId.replace(/^\[/, "").replace(/\]$/, "");
  const row = db.prepare(
    `SELECT encrypted, iv, tag, expires_at FROM token_vault WHERE token_id = ?`
  ).get(clean) as { encrypted: string; iv: string; tag: string; expires_at: number | null } | undefined;

  if (!row) return null;
  if (row.expires_at && row.expires_at < Date.now()) {
    db.prepare("DELETE FROM token_vault WHERE token_id = ?").run(clean);
    return null;
  }

  return decrypt(row.encrypted, row.iv, row.tag);
}

export function redactReversible(
  text: string,
  matches: Array<{ type: string; value: string }>,
  ttlSeconds?: number
): string {
  let result = text;
  const sorted = [...matches].sort((a, b) => b.value.length - a.value.length);

  for (const match of sorted) {
    if (!match.value) continue;
    const token = storeToken(match.value, match.type, ttlSeconds);
    result = result.split(match.value).join(token);
  }

  return result;
}

export function purgeExpired(): number {
  init();
  const result = db.prepare(
    `DELETE FROM token_vault WHERE expires_at IS NOT NULL AND expires_at < ?`
  ).run(Date.now());
  return result.changes;
}

export function listTokens(
  limit = 50,
  offset = 0
): Array<{ tokenId: string; type: string; createdAt: number; expired: boolean }> {
  init();
  const rows = db.prepare(
    `SELECT token_id, type, created_at, expires_at FROM token_vault
     ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(limit, offset) as Array<{
    token_id: string;
    type: string;
    created_at: number;
    expires_at: number | null;
  }>;

  return rows.map((r) => ({
    tokenId: r.token_id,
    type: r.type,
    createdAt: r.created_at,
    expired: r.expires_at ? r.expires_at < Date.now() : false
  }));
}
