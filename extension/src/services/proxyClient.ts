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
      ...(payload ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(payload)) } : {}),
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
  registered: boolean;
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
  bypassedFilePaths?: string[],
  tools?: OpenAiTool[]
): Promise<EstimateResult> {
  const res = await request("POST", "/api/estimate", {
    model,
    messages,
    tools,
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

export async function getModelCatalog(): Promise<CatalogProvider[]> {
  const res = await request("GET", "/api/models/catalog");
  return (res.data ?? []) as CatalogProvider[];
}

export async function addModelWithMeta(
  providerId: number,
  model: CatalogModel
): Promise<ModelInfo> {
  const res = await request("POST", `/api/providers/${providerId}/models`, {
    modelName: model.modelName,
    displayName: model.displayName,
    inputCostPer1k: model.inputCostPer1k,
    outputCostPer1k: model.outputCostPer1k,
    maxContextTokens: model.maxContextTokens
  });
  return res.data as ModelInfo;
}

// ── MCP Tool Discovery + Execution ────────────────────────────────────────

export type McpTool = {
  server: string;
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties?: Record<string, unknown>;
    required?: string[];
  };
};

export type McpServer = {
  name: string;
  targetUrl: string;
  online?: boolean;
};

/** Fetch all tools from all configured MCP servers (aggregated). */
export async function listMcpTools(): Promise<McpTool[]> {
  try {
    const res = await request("GET", "/mcp/proxy/tools");
    return (res.data ?? []) as McpTool[];
  } catch {
    return [];
  }
}

/** Execute a single tool call through the MCP security proxy. */
export async function callMcpTool(
  serverName: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ content: Array<{ type: string; text?: string }>; isError: boolean }> {
  const res = await request("POST", "/mcp/proxy/call-tool", {
    serverName, toolName, arguments: args
  });
  return res.data as { content: Array<{ type: string; text?: string }>; isError: boolean };
}

/** List configured MCP servers with live online status. */
export async function listMcpServers(): Promise<McpServer[]> {
  try {
    const res = await request("GET", "/api/mcp/servers");
    return (res.data ?? []) as McpServer[];
  } catch {
    return [];
  }
}

/** Add a new MCP server configuration. */
export async function addMcpServer(name: string, targetUrl: string): Promise<McpServer> {
  const res = await request("POST", "/api/mcp/servers", { name, targetUrl });
  if (res.status >= 400) {
    const errData = res.data as Record<string, unknown>;
    throw new Error((errData.error as string) ?? "Failed to add MCP server");
  }
  return res.data as McpServer;
}

/** Remove an MCP server configuration by name. */
export async function deleteMcpServer(name: string): Promise<void> {
  await request("DELETE", `/api/mcp/servers/${encodeURIComponent(name)}`);
}

// ── Streaming ──────────────────────────────────────────────────────────────

export type ToolCallResult = {
  id: string;
  name: string;   // "server__toolName" format
  argsJson: string;
};

export type StreamCallbacks = {
  onChunk: (text: string) => void;
  onToolCalls?: (calls: ToolCallResult[]) => void;
  onDone: (firewallMeta?: FirewallMeta) => void;
  onError: (err: Error) => void;
};

/**
 * Sends a streaming chat completion request to the proxy.
 * Returns a cancel function — call it to abort mid-stream.
 *
 * The proxy already supports SSE for all providers.  We set
 * `Accept: text/event-stream` and `stream: true` so each
 * delta arrives as `data: {"choices":[{"delta":{"content":"..."}}]}`.
 */
export type OpenAiTool = {
  type: "function";
  function: { name: string; description?: string; parameters?: unknown };
};

export function streamChatCompletion(
  model: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  filePaths?: string[],
  projectRoot?: string,
  bypassedFilePaths?: string[],
  tools?: OpenAiTool[]
): () => void {
  const base = getBaseUrl();
  const url = new URL("/v1/chat/completions", base);
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;

  const body = JSON.stringify({
    model,
    messages,
    stream: true,
    tools,
    metadata:
      filePaths || projectRoot || bypassedFilePaths?.length
        ? {
            ...(filePaths ? { filePaths } : {}),
            ...(projectRoot ? { projectRoot } : {}),
            ...(bypassedFilePaths?.length ? { bypassedFilePaths } : {})
          }
        : undefined
  });

  const auth = getAuthHeader();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Content-Length": String(Buffer.byteLength(body)),
    Accept: "text/event-stream",
    ...(auth ? { Authorization: auth } : {})
  };

  let firewallMeta: FirewallMeta | undefined;
  let settled = false;
  // Accumulate streaming tool calls by index (OpenAI streaming format)
  const toolCallMap: Map<number, { id: string; name: string; argsJson: string }> = new Map();

  const req = transport.request(url, { method: "POST", headers }, (res) => {
    let buf = "";

    res.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as Record<string, unknown>;
          if (parsed._firewall) {
            firewallMeta = parsed._firewall as FirewallMeta;
          }
          const delta = (parsed.choices as any)?.[0]?.delta;
          // Text content
          if (delta?.content) callbacks.onChunk(delta.content as string);
          // Tool call deltas (OpenAI streaming: index-based fragments)
          const tcDeltas = delta?.tool_calls as Array<{
            index: number;
            id?: string;
            type?: string;
            function?: { name?: string; arguments?: string };
          }> | undefined;
          if (tcDeltas) {
            for (const tc of tcDeltas) {
              const idx = tc.index ?? 0;
              if (!toolCallMap.has(idx)) {
                toolCallMap.set(idx, { id: "", name: "", argsJson: "" });
              }
              const entry = toolCallMap.get(idx)!;
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.name = tc.function.name;
              if (tc.function?.arguments) entry.argsJson += tc.function.arguments;
            }
          }
        } catch { /* malformed SSE line */ }
      }
    });

    res.on("end", () => {
      if (!settled) {
        settled = true;
        if (toolCallMap.size > 0 && callbacks.onToolCalls) {
          const calls = Array.from(toolCallMap.values()).filter((c) => c.id || c.name);
          if (calls.length > 0) callbacks.onToolCalls(calls);
        }
        callbacks.onDone(firewallMeta);
      }
    });
    res.on("error", (err) => {
      if (!settled) { settled = true; callbacks.onError(err); }
    });
  });

  req.on("error", (err) => {
    if (!settled) { settled = true; callbacks.onError(err); }
  });
  req.setTimeout(300_000, () => req.destroy(new Error("Stream timeout")));
  req.write(body);
  req.end();

  return () => { if (!settled) { settled = true; req.destroy(); } };
}
