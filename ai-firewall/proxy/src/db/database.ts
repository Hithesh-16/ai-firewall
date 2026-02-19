import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../config";

const dbPath = path.resolve(process.cwd(), env.DB_PATH);
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
-- Phase 1: request logs
CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  original_hash TEXT NOT NULL,
  sanitized_text TEXT NOT NULL,
  secrets_found INTEGER DEFAULT 0,
  pii_found INTEGER DEFAULT 0,
  files_blocked INTEGER DEFAULT 0,
  risk_score INTEGER DEFAULT 0,
  action TEXT NOT NULL,
  reasons TEXT,
  response_time_ms INTEGER,
  user_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_action ON logs(action);
CREATE INDEX IF NOT EXISTS idx_logs_provider ON logs(provider);

-- Phase 3: organizations
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- Phase 3: users
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'developer',
  org_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);

-- Phase 3: API tokens
CREATE TABLE IF NOT EXISTS api_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL,
  expires_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_tokens_hash ON api_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON api_tokens(user_id);

-- Phase 4: AI providers
CREATE TABLE IF NOT EXISTS providers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  base_url TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Phase 4: models per provider
CREATE TABLE IF NOT EXISTS models (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_name TEXT NOT NULL,
  display_name TEXT,
  input_cost_per_1k REAL DEFAULT 0,
  output_cost_per_1k REAL DEFAULT 0,
  max_context_tokens INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  UNIQUE(provider_id, model_name)
);

CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);

-- Phase 4: credit limits
CREATE TABLE IF NOT EXISTS credits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id INTEGER REFERENCES providers(id) ON DELETE CASCADE,
  model_id INTEGER REFERENCES models(id) ON DELETE CASCADE,
  limit_type TEXT NOT NULL,
  total_limit REAL NOT NULL,
  used_amount REAL DEFAULT 0,
  reset_period TEXT NOT NULL,
  reset_date INTEGER NOT NULL,
  hard_limit INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_credits_provider ON credits(provider_id);

-- Phase 4: usage tracking
CREATE TABLE IF NOT EXISTS usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id INTEGER REFERENCES logs(id),
  provider_id INTEGER NOT NULL REFERENCES providers(id),
  model_name TEXT NOT NULL,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  cost REAL DEFAULT 0,
  timestamp INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_usage_provider ON usage_logs(provider_id);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_logs(timestamp);
`);

export default db;
