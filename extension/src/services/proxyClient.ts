import * as http from "node:http";
import * as https from "node:https";
import * as vscode from "vscode";

function getBaseUrl(): string {
  return vscode.workspace
    .getConfiguration("aiFirewall")
    .get<string>("proxyUrl", "http://localhost:8080");
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

    const req = transport.request(
      url,
      {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {})
        }
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
  filePaths?: string[]
): Promise<EstimateResult> {
  const res = await request("POST", "/api/estimate", {
    model,
    messages,
    metadata: filePaths ? { filePaths } : undefined
  });
  return res.data as EstimateResult;
}

export async function chatCompletion(
  model: string,
  messages: ChatMessage[],
  filePaths?: string[]
): Promise<ChatResponse> {
  const res = await request("POST", "/v1/chat/completions", {
    model,
    messages,
    metadata: filePaths ? { filePaths } : undefined
  });
  if (res.status >= 400) {
    const errData = res.data as Record<string, unknown>;
    throw new Error(
      (errData.error as string) ?? `Request failed with status ${res.status}`
    );
  }
  return res.data as ChatResponse;
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
