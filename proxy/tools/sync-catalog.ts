import db from "../src/db/database";
import { MODEL_CATALOG } from "../src/routes/provider.route";
import { encrypt } from "../src/vault/encryption";

function syncCatalog() {
  console.log("Synchronizing Model Catalog to local SQLite DB...");
  const insertProvider = db.prepare(`
    INSERT INTO providers (name, slug, base_url, api_key_encrypted, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(slug) DO UPDATE SET
      name = excluded.name,
      base_url = excluded.base_url,
      updated_at = excluded.updated_at
  `);

  const insertModel = db.prepare(`
    INSERT INTO models (provider_id, model_name, display_name, input_cost_per_1k, output_cost_per_1k, max_context_tokens, enabled)
    VALUES (?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(provider_id, model_name) DO UPDATE SET
      display_name = excluded.display_name,
      input_cost_per_1k = excluded.input_cost_per_1k,
      output_cost_per_1k = excluded.output_cost_per_1k,
      max_context_tokens = excluded.max_context_tokens
  `);

  db.transaction(() => {
    for (const p of MODEL_CATALOG) {
      const now = Date.now();
      // Use a dummy key if it's new, the user has to update it in the UI later
      const dummyKeyEnc = encrypt("dummy-key-" + p.slug);
      
      insertProvider.run(
        p.name,
        p.slug,
        p.baseUrl,
        dummyKeyEnc,
        1,
        now,
        now
      );

      // Get the provider ID
      const providerRow = db.prepare("SELECT id FROM providers WHERE slug = ?").get(p.slug) as { id: number };
      
      for (const m of p.models) {
        insertModel.run(
          providerRow.id,
          m.modelName,
          m.displayName,
          m.inputCostPer1k,
          m.outputCostPer1k,
          m.maxContextTokens
        );
      }
    }
  })();
  
  console.log("Database synchronized successfully!");
}

syncCatalog();
