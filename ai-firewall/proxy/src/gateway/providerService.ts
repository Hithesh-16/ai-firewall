import db from "../db/database";
import { Provider } from "../types";
import { decrypt, encrypt } from "../vault/encryption";

type ProviderRow = {
  id: number;
  name: string;
  slug: string;
  base_url: string;
  api_key_encrypted: string;
  enabled: number;
  created_at: number;
  updated_at: number;
};

function toProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    baseUrl: row.base_url,
    apiKeyEncrypted: row.api_key_encrypted,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function createProvider(
  name: string,
  apiKey: string,
  baseUrl: string
): Provider {
  const slug = slugify(name);
  const now = Date.now();
  const encrypted = encrypt(apiKey);

  const stmt = db.prepare(`
    INSERT INTO providers (name, slug, base_url, api_key_encrypted, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
  `);

  const result = stmt.run(name, slug, baseUrl, encrypted, now, now);
  return getProviderById(Number(result.lastInsertRowid))!;
}

export function listProviders(): Provider[] {
  const rows = db.prepare("SELECT * FROM providers ORDER BY name").all() as ProviderRow[];
  return rows.map(toProvider);
}

export function getProviderById(id: number): Provider | null {
  const row = db
    .prepare("SELECT * FROM providers WHERE id = ?")
    .get(id) as ProviderRow | undefined;
  return row ? toProvider(row) : null;
}

export function getProviderBySlug(slug: string): Provider | null {
  const row = db
    .prepare("SELECT * FROM providers WHERE slug = ?")
    .get(slug) as ProviderRow | undefined;
  return row ? toProvider(row) : null;
}

export function updateProvider(
  id: number,
  updates: { name?: string; baseUrl?: string; apiKey?: string; enabled?: boolean }
): Provider | null {
  const provider = getProviderById(id);
  if (!provider) return null;

  const now = Date.now();
  const fields: string[] = ["updated_at = ?"];
  const values: unknown[] = [now];

  if (updates.name !== undefined) {
    fields.push("name = ?", "slug = ?");
    values.push(updates.name, slugify(updates.name));
  }
  if (updates.baseUrl !== undefined) {
    fields.push("base_url = ?");
    values.push(updates.baseUrl);
  }
  if (updates.apiKey !== undefined) {
    fields.push("api_key_encrypted = ?");
    values.push(encrypt(updates.apiKey));
  }
  if (updates.enabled !== undefined) {
    fields.push("enabled = ?");
    values.push(updates.enabled ? 1 : 0);
  }

  values.push(id);
  db.prepare(`UPDATE providers SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  return getProviderById(id);
}

export function deleteProvider(id: number): boolean {
  const result = db.prepare("DELETE FROM providers WHERE id = ?").run(id);
  return result.changes > 0;
}

export function decryptProviderKey(provider: Provider): string {
  return decrypt(provider.apiKeyEncrypted);
}
