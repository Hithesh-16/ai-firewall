import * as http from "node:http";
import * as https from "node:https";
import * as vscode from "vscode";

function getBaseUrl(): string {
  return vscode.workspace
    .getConfiguration("aiFirewall")
    .get<string>("proxyUrl", "http://localhost:8080");
}

function getAuthHeader(): string | undefined {
  const token = vscode.workspace
    .getConfiguration("aiFirewall")
    .get<string>("apiToken", "");
  return token?.trim() ? `Bearer ${token.trim()}` : undefined;
}

function request(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const base = getBaseUrl();
    const url = new URL(path, base);
    const isHttps = url.protocol === "https:";
    const transport = isHttps ? https : http;

    const payload = body ? JSON.stringify(body) : undefined;
    const auth = getAuthHeader();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(payload ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}),
      ...(auth ? { Authorization: auth } : {})
    };

    const req = transport.request(
      url,
      {
        method,
        headers
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk: Buffer) => {
          raw += chunk.toString();
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, data: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode ?? 0, data: raw });
          }
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(120_000, () => {
      req.destroy(new Error("Request timeout"));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

export type EstimateResult = {
  estimatedInputTokens: number;
  estimatedCost: number;
  creditRemaining: number;
  creditLimitType: string;
  scan: {
    action: "ALLOW" | "BLOCK" | "REDACT";
    secretsFound: number;
    piiFound: number;
    filesBlocked: string[];
    riskScore: number;
    reasons: string[];
    sensitiveFiles?: string[];
    findingTypes?: string[];
  };
  model: {
    name: string;
    displayName: string;
    provider: string;
    registered: boolean;
  };
};

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

export type CreditInfo = {
  id: number;
  providerId: number | null;
  modelId: number | null;
  limitType: string;
  totalLimit: number;
  usedAmount: number;
  resetPeriod: string;
  resetDate: number;
  hardLimit: boolean;
};

export type ChatMessage = { role: string; content: string };

export type FirewallMeta = {
  action: string;
  secrets_found: number;
  pii_found: number;
  risk_score: number;
  routed_to: string;
  model_used: string;
  tokens_used?: number;
  cost_estimate?: number;
  credit_remaining?: number;
};

export type ChatResponse = {
  choices?: Array<{ message?: { role: string; content: string } }>;
  _firewall?: FirewallMeta;
  error?: string;
};

export type AuthUser = { id: number; email: string; name: string; role: string; orgId?: number | null };

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await request("GET", "/health");
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function estimate(
  model: string,
  messages: ChatMessage[],
  filePaths?: string[],
  projectRoot?: string,
  bypassedFilePaths?: string[]
): Promise<EstimateResult> {
  const res = await request("POST", "/api/estimate", {
    model,
    messages,
    metadata: filePaths || projectRoot || bypassedFilePaths?.length
      ? {
          ...(filePaths ? { filePaths } : {}),
          ...(projectRoot ? { projectRoot } : {}),
          ...(bypassedFilePaths?.length ? { bypassedFilePaths } : {})
        }
      : undefined
  });
  return res.data as EstimateResult;
}

export async function chatCompletion(
  model: string,
  messages: ChatMessage[],
  filePaths?: string[],
  projectRoot?: string,
  bypassedFilePaths?: string[]
): Promise<ChatResponse> {
  const res = await request("POST", "/v1/chat/completions", {
    model,
    messages,
    metadata: filePaths || projectRoot || bypassedFilePaths?.length
      ? {
          ...(filePaths ? { filePaths } : {}),
          ...(projectRoot ? { projectRoot } : {}),
          ...(bypassedFilePaths?.length ? { bypassedFilePaths } : {})
        }
      : undefined
  });
  if (res.status >= 400) {
    const errData = res.data as Record<string, unknown>;
    const main = (errData.error as string) ?? `Request failed with status ${res.status}`;
    const details = errData.details;
    const detailsStr =
      details === undefined || details === null
        ? ""
        : typeof details === "string"
          ? details
          : typeof (details as { error?: { message?: string } }).error?.message === "string"
            ? (details as { error: { message: string } }).error.message
            : JSON.stringify(details);
    const full = detailsStr ? `${main}: ${detailsStr}` : main;
    throw new Error(full);
  }
  return res.data as ChatResponse;
}

export async function login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const res = await request("POST", "/api/auth/login", { email, password });
  if (res.status >= 400) {
    const errData = res.data as Record<string, unknown>;
    throw new Error((errData.error as string) ?? `Login failed with status ${res.status}`);
  }
  return res.data as { user: AuthUser; token: string };
}

export async function register(email: string, name: string, password: string): Promise<{ user: AuthUser; token: string }> {
  const res = await request("POST", "/api/auth/register", { email, name, password });
  if (res.status >= 400) {
    const errData = res.data as Record<string, unknown>;
    throw new Error((errData.error as string) ?? `Register failed with status ${res.status}`);
  }
  return res.data as { user: AuthUser; token: string };
}

export async function me(): Promise<{ user: AuthUser }> {
  const res = await request("GET", "/api/auth/me");
  if (res.status >= 400) {
    const errData = res.data as Record<string, unknown>;
    throw new Error((errData.error as string) ?? `Auth check failed with status ${res.status}`);
  }
  return res.data as { user: AuthUser };
}

export type FileScopeConfig = {
  mode: "blocklist" | "allowlist";
  blocklist: string[];
  allowlist: string[];
  max_file_size_kb: number;
  scan_on_open: boolean;
  scan_on_send: boolean;
};

export async function getFileScope(): Promise<{ file_scope: FileScopeConfig }> {
  const res = await request("GET", "/api/file-scope");
  if (res.status >= 400) {
    const errData = res.data as Record<string, unknown>;
    throw new Error((errData.error as string) ?? `GET /api/file-scope failed: ${res.status}`);
  }
  return res.data as { file_scope: FileScopeConfig };
}

export async function updateFileScope(file_scope: FileScopeConfig): Promise<{ ok: true; file_scope: FileScopeConfig }> {
  const res = await request("PUT", "/api/file-scope", file_scope);
  if (res.status >= 400) {
    const errData = res.data as Record<string, unknown>;
    throw new Error((errData.error as string) ?? `PUT /api/file-scope failed: ${res.status}`);
  }
  return res.data as { ok: true; file_scope: FileScopeConfig };
}

export async function listProviders(): Promise<ProviderInfo[]> {
  const res = await request("GET", "/api/providers");
  return (res.data ?? []) as ProviderInfo[];
}

export async function addProvider(
  name: string,
  apiKey: string,
  baseUrl: string
): Promise<ProviderInfo> {
  const res = await request("POST", "/api/providers", { name, apiKey, baseUrl });
  if (res.status >= 400) {
    const errData = res.data as Record<string, unknown>;
    throw new Error((errData.error as string) ?? "Failed to add provider");
  }
  return res.data as ProviderInfo;
}

export async function deleteProviderById(id: number): Promise<void> {
  await request("DELETE", `/api/providers/${id}`);
}

export async function toggleProvider(
  id: number,
  enabled: boolean
): Promise<void> {
  await request("PATCH", `/api/providers/${id}`, { enabled });
}

export async function listModels(): Promise<ModelInfo[]> {
  const res = await request("GET", "/api/models");
  return (res.data ?? []) as ModelInfo[];
}

export async function addModel(
  providerId: number,
  modelName: string,
  opts?: {
    displayName?: string;
    inputCostPer1k?: number;
    outputCostPer1k?: number;
  }
): Promise<ModelInfo> {
  const res = await request("POST", `/api/providers/${providerId}/models`, {
    modelName,
    ...opts
  });
  return res.data as ModelInfo;
}

export async function listCredits(): Promise<CreditInfo[]> {
  const res = await request("GET", "/api/credits");
  return (res.data ?? []) as CreditInfo[];
}

export async function getUsageSummary(): Promise<{
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byModel: Array<{
    modelName: string;
    requests: number;
    tokens: number;
    cost: number;
  }>;
}> {
  const res = await request("GET", "/api/usage/summary");
  return res.data as {
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    byModel: Array<{
      modelName: string;
      requests: number;
      tokens: number;
      cost: number;
    }>;
  };
}
