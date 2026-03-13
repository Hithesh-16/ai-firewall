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

// --- Credits & Usage ---

export type Credit = {
  id: number;
  providerId: number | null;
  limitType: "requests" | "tokens" | "dollars";
  totalLimit: number;
  usedAmount: number;
  resetPeriod: "daily" | "weekly" | "monthly";
  resetDate: number;
  hardLimit: boolean;
};

export type UsageSummary = {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byModel: Array<{ modelName: string; requests: number; tokens: number; cost: number }>;
};

export async function fetchCredits(providerId?: number): Promise<Credit[]> {
  const params = providerId ? `?providerId=${providerId}` : "";
  return get(`/api/credits${params}`);
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  return get("/api/usage/summary");
}

// --- MCP Servers ---

export type McpServer = {
  name: string;
  targetUrl: string;
  online: boolean;
};

export async function fetchMcpServers(): Promise<McpServer[]> {
  return get("/api/mcp/servers");
}

export async function addMcpServer(name: string, targetUrl: string): Promise<McpServer> {
  return post("/api/mcp/servers", { name, targetUrl });
}

export async function deleteMcpServer(name: string): Promise<void> {
  return del(`/api/mcp/servers/${name}`);
}

// --- Model Catalog ---

export type CatalogModel = {
  modelName: string;
  displayName: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
  maxContextTokens: number;
  tags?: string[];
};

export type CatalogProvider = {
  name: string;
  slug: string;
  baseUrl: string;
  authUrl: string;
  description: string;
  models: CatalogModel[];
};

export async function fetchModelCatalog(): Promise<CatalogProvider[]> {
  return get("/api/models/catalog");
}
