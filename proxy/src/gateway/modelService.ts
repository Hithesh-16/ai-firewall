import db from "../db/database";
import { Model } from "../types";

type ModelRow = {
  id: number;
  provider_id: number;
  model_name: string;
  display_name: string | null;
  input_cost_per_1k: number;
  output_cost_per_1k: number;
  max_context_tokens: number;
  enabled: number;
};

function toModel(row: ModelRow): Model {
  return {
    id: row.id,
    providerId: row.provider_id,
    modelName: row.model_name,
    displayName: row.display_name ?? row.model_name,
    inputCostPer1k: row.input_cost_per_1k,
    outputCostPer1k: row.output_cost_per_1k,
    maxContextTokens: row.max_context_tokens,
    enabled: row.enabled === 1
  };
}

export function addModel(
  providerId: number,
  modelName: string,
  opts?: {
    displayName?: string;
    inputCostPer1k?: number;
    outputCostPer1k?: number;
    maxContextTokens?: number;
  }
): Model {
  const stmt = db.prepare(`
    INSERT INTO models (provider_id, model_name, display_name, input_cost_per_1k, output_cost_per_1k, max_context_tokens, enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
  `);

  const result = stmt.run(
    providerId,
    modelName,
    opts?.displayName ?? modelName,
    opts?.inputCostPer1k ?? 0,
    opts?.outputCostPer1k ?? 0,
    opts?.maxContextTokens ?? 0
  );

  return getModelById(Number(result.lastInsertRowid))!;
}

export function listModels(providerId?: number): Model[] {
  if (providerId !== undefined) {
    const rows = db
      .prepare("SELECT * FROM models WHERE provider_id = ? ORDER BY model_name")
      .all(providerId) as ModelRow[];
    return rows.map(toModel);
  }
  const rows = db.prepare("SELECT * FROM models ORDER BY provider_id, model_name").all() as ModelRow[];
  return rows.map(toModel);
}

export function getModelById(id: number): Model | null {
  const row = db.prepare("SELECT * FROM models WHERE id = ?").get(id) as ModelRow | undefined;
  return row ? toModel(row) : null;
}

export function findModelByName(modelName: string): Model | null {
  const row = db
    .prepare("SELECT * FROM models WHERE model_name = ? AND enabled = 1")
    .get(modelName) as ModelRow | undefined;
  return row ? toModel(row) : null;
}

export function updateModel(
  id: number,
  updates: {
    displayName?: string;
    inputCostPer1k?: number;
    outputCostPer1k?: number;
    maxContextTokens?: number;
    enabled?: boolean;
  }
): Model | null {
  const model = getModelById(id);
  if (!model) return null;

  const fields: string[] = [];
  const values: unknown[] = [];

  if (updates.displayName !== undefined) {
    fields.push("display_name = ?");
    values.push(updates.displayName);
  }
  if (updates.inputCostPer1k !== undefined) {
    fields.push("input_cost_per_1k = ?");
    values.push(updates.inputCostPer1k);
  }
  if (updates.outputCostPer1k !== undefined) {
    fields.push("output_cost_per_1k = ?");
    values.push(updates.outputCostPer1k);
  }
  if (updates.maxContextTokens !== undefined) {
    fields.push("max_context_tokens = ?");
    values.push(updates.maxContextTokens);
  }
  if (updates.enabled !== undefined) {
    fields.push("enabled = ?");
    values.push(updates.enabled ? 1 : 0);
  }

  if (fields.length === 0) return model;

  values.push(id);
  db.prepare(`UPDATE models SET ${fields.join(", ")} WHERE id = ?`).run(...values);

  return getModelById(id);
}

export function deleteModel(id: number): boolean {
  const result = db.prepare("DELETE FROM models WHERE id = ?").run(id);
  return result.changes > 0;
}
