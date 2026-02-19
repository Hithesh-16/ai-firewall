import db from "../db/database";
import { Organization } from "../types";

export function createOrg(name: string, slug: string): Organization {
  const now = Date.now();
  const stmt = db.prepare(`INSERT INTO organizations (name, slug, created_at) VALUES (?, ?, ?)`);
  const result = stmt.run(name, slug, now);

  return { id: result.lastInsertRowid as number, name, slug, createdAt: now };
}

export function getOrgById(id: number): Organization | null {
  const row = db.prepare(`SELECT * FROM organizations WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToOrg(row) : null;
}

export function getOrgBySlug(slug: string): Organization | null {
  const row = db.prepare(`SELECT * FROM organizations WHERE slug = ?`).get(slug) as
    | Record<string, unknown>
    | undefined;
  return row ? rowToOrg(row) : null;
}

export function listOrgs(): Organization[] {
  const rows = db.prepare(`SELECT * FROM organizations ORDER BY created_at`).all() as Record<string, unknown>[];
  return rows.map(rowToOrg);
}

export function deleteOrg(id: number): boolean {
  const result = db.prepare(`DELETE FROM organizations WHERE id = ?`).run(id);
  return result.changes > 0;
}

export function assignUserToOrg(userId: number, orgId: number): void {
  db.prepare(`UPDATE users SET org_id = ?, updated_at = ? WHERE id = ?`).run(orgId, Date.now(), userId);
}

export function removeUserFromOrg(userId: number): void {
  db.prepare(`UPDATE users SET org_id = NULL, updated_at = ? WHERE id = ?`).run(Date.now(), userId);
}

function rowToOrg(row: Record<string, unknown>): Organization {
  return {
    id: row.id as number,
    name: row.name as string,
    slug: row.slug as string,
    createdAt: row.created_at as number
  };
}
