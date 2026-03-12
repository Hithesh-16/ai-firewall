const BASE = "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`);
  return res.json();
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
  return res.json();
}

export type LogEntry = {
  id: number;
  timestamp: number;
  model: string;
  provider: string;
  original_hash: string;
  sanitized_text: string;
  secrets_found: number;
  pii_found: number;
  risk_score: number;
  action: "ALLOW" | "BLOCK" | "REDACT";
  reasons: string;
  response_time_ms: number;
  user_id: number | null;
};

export type StatsResponse = {
  totalRequests: number;
  blocked: number;
  redacted: number;
  allowed: number;
  avgRiskScore: number;
  secretsByType: Record<string, number>;
  requestsByDay: Array<{ date: string; count: number }>;
};

export type PolicyConfig = {
  version: string;
  rules: Record<string, boolean>;
  file_scope: {
    mode: string;
    blocklist: string[];
    allowlist: string[];
    max_file_size_kb: number;
  };
  blocked_paths: string[];
  severity_threshold: string;
  smart_routing?: {
    enabled: boolean;
    routes: Array<{ condition: string; target: string }>;
    local_llm: { provider: string; model: string; endpoint: string };
  };
};

export async function fetchHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchStats(): Promise<StatsResponse> {
  return get("/api/stats");
}

export async function fetchRiskScore(): Promise<{
  riskScore: number;
  breakdown: Record<string, number>;
}> {
  return get("/api/risk-score");
}

export async function fetchLogs(
  page = 1,
  limit = 50,
  action?: string
): Promise<{ logs: LogEntry[]; total: number; page: number; limit: number }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (action) params.set("action", action);
  return get(`/api/logs?${params}`);
}

export async function fetchPolicy(): Promise<PolicyConfig> {
  return get("/api/policy");
}

export async function updatePolicy(policy: PolicyConfig): Promise<PolicyConfig> {
  return put("/api/policy", policy);
}

// --- Providers & Models (BYOK) ---

export type ProviderInfo = {
  id: number;
  name: string;
  slug: string;
  baseUrl: string;
  enabled: boolean;
  createdAt: number;
};

export type ModelInfo = {
  id: number;
  providerId: number;
  modelName: string;
  displayName: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
  maxContextTokens: number;
  enabled: boolean;
};

export async function fetchProviders(): Promise<ProviderInfo[]> {
  return get("/api/providers");
}

export async function addProvider(name: string, apiKey: string, baseUrl: string): Promise<ProviderInfo> {
  return post("/api/providers", { name, apiKey, baseUrl });
}

export async function deleteProvider(id: number): Promise<void> {
  return del(`/api/providers/${id}`);
}

export async function fetchModels(providerId?: number): Promise<ModelInfo[]> {
  if (providerId != null) return get(`/api/providers/${providerId}/models`);
  return get("/api/models");
}

export async function addModel(
  providerId: number,
  modelName: string,
  opts?: { displayName?: string; inputCostPer1k?: number; outputCostPer1k?: number }
): Promise<ModelInfo> {
  return post(`/api/providers/${providerId}/models`, { modelName, ...opts });
}
