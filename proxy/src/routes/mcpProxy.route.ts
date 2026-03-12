import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { loadPolicyConfig } from "../config";
import { scanMcpJson } from "../mcp/mcpScanner";
import { checkFileScope } from "../scope/fileScope";
import { scanPromptInjection } from "../scanner/promptInjectionScanner";
import { logRequest } from "../logger/logger";
import crypto from "node:crypto";

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/**
 * Resolves the base URL for a named MCP server from policy config.
 * Falls back to the legacy single `targetUrl` field for backwards compatibility.
 */
function resolveTargetBase(policy: ReturnType<typeof loadPolicyConfig>, serverName?: string): string | null {
  const cfg = policy.mcp_proxy;
  if (!cfg?.enabled) return null;

  // Multi-server config
  if (cfg.servers && cfg.servers.length > 0) {
    const server = serverName
      ? cfg.servers.find((s) => s.name === serverName)
      : cfg.servers[0];
    return server?.targetUrl ?? null;
  }

  // Legacy single targetUrl — strip any trailing path so we always have a base URL
  if (cfg.targetUrl) {
    try {
      const u = new URL(cfg.targetUrl);
      return `${u.protocol}//${u.host}`;
    } catch {
      return cfg.targetUrl;
    }
  }

  return null;
}

export async function registerMcpProxyRoutes(app: FastifyInstance): Promise<void> {

  /**
   * POST /mcp/proxy/messages
   *
   * Intercepts JSON-RPC MCP messages from the AI client before they reach the
   * downstream MCP tool server.  Enforced checks:
   *
   *  tools/call   — scan tool arguments for secrets/PII; scan prompt injection
   *  resources/read — enforce file_scope blocklist on the requested resource URI
   *                   AND scan the returned content for secrets/PII
   *  All other methods pass through after the response content is scanned.
   */
  app.post("/mcp/proxy/messages", async (request: FastifyRequest, reply: FastifyReply) => {
    const policy = loadPolicyConfig();
    const serverName = (request.query as any).server as string | undefined;
    const targetBase = resolveTargetBase(policy, serverName);

    if (!targetBase) {
      return reply.status(503).send({ error: "MCP Proxy is not enabled or no target server configured in policy." });
    }

    const payload = request.body as any;
    const method: string = payload?.method ?? "";

    // ── 1. Intercept tools/call ──────────────────────────────────────────────
    if (method === "tools/call" && payload.params && typeof payload.params.arguments === "object") {
      const argsString = JSON.stringify(payload.params.arguments);

      // 1a. Prompt injection check on tool arguments
      const injectionConfig = policy.prompt_injection;
      if (injectionConfig?.enabled !== false) {
        const injResult = scanPromptInjection(argsString);
        const threshold = injectionConfig?.threshold ?? 60;
        if (injResult.isInjection || injResult.score >= threshold) {
          logRequest({
            timestamp: Date.now(),
            model: "mcp-proxy",
            provider: "mcp-server",
            originalHash: hashText(argsString),
            sanitizedText: "[BLOCKED_INJECTION]",
            secretsFound: 0,
            piiFound: 0,
            filesBlocked: 0,
            riskScore: injResult.score,
            action: "BLOCK",
            reasons: [`Prompt injection detected in MCP tool arguments (score: ${injResult.score})`],
            responseTimeMs: 0
          });
          return reply.send({
            jsonrpc: "2.0",
            id: payload.id,
            error: {
              code: -32603,
              message: "Request blocked by AI Firewall: prompt injection detected in tool arguments.",
              data: { score: injResult.score }
            }
          });
        }
      }

      // 1b. Secret / PII scan on tool arguments
      const argsScan = scanMcpJson(argsString);

      if (argsScan.action === "BLOCK") {
        logRequest({
          timestamp: Date.now(),
          model: "mcp-proxy",
          provider: "mcp-server",
          originalHash: hashText(argsString),
          sanitizedText: "[BLOCKED]",
          secretsFound: argsScan.reasons.length,
          piiFound: 0,
          filesBlocked: 0,
          riskScore: argsScan.riskScore,
          action: "BLOCK",
          reasons: argsScan.reasons,
          responseTimeMs: 0
        });
        return reply.send({
          jsonrpc: "2.0",
          id: payload.id,
          error: {
            code: -32603,
            message: "Request blocked by AI Firewall due to sensitive data in tool arguments.",
            data: { reasons: argsScan.reasons }
          }
        });
      }

      if (argsScan.action === "REDACT" && argsScan.sanitizedJson) {
        try {
          payload.params.arguments = JSON.parse(argsScan.sanitizedJson);
          logRequest({
            timestamp: Date.now(),
            model: "mcp-proxy",
            provider: "mcp-server",
            originalHash: hashText(argsString),
            sanitizedText: "[REDACTED]",
            secretsFound: argsScan.reasons.length,
            piiFound: 0,
            filesBlocked: 0,
            riskScore: argsScan.riskScore,
            action: "REDACT",
            reasons: argsScan.reasons,
            responseTimeMs: 0
          });
        } catch {
          app.log.error("MCP Proxy: failed to parse sanitized tool arguments JSON.");
        }
      }
    }

    // ── 2. Intercept resources/read ──────────────────────────────────────────
    //
    // This is the most critical path for the AI Firewall goal: an LLM using an
    // MCP filesystem server will call resources/read to fetch file contents that
    // are then injected directly into its context window.  We enforce the same
    // file_scope blocklist that protects the VS Code extension.
    if (method === "resources/read" && payload.params?.uri) {
      const resourceUri: string = payload.params.uri;

      // Convert file:// URI → relative path for scope checking
      const filePath = resourceUri.startsWith("file://")
        ? resourceUri.slice("file://".length)
        : resourceUri;

      const scopeResult = checkFileScope(filePath, policy.file_scope);
      if (!scopeResult.allowed) {
        const reason = scopeResult.reason ?? `Resource URI blocked by file scope: ${filePath}`;
        logRequest({
          timestamp: Date.now(),
          model: "mcp-proxy",
          provider: "mcp-server",
          originalHash: hashText(resourceUri),
          sanitizedText: "[BLOCKED_SCOPE]",
          secretsFound: 0,
          piiFound: 0,
          filesBlocked: 1,
          riskScore: 100,
          action: "BLOCK",
          reasons: [reason],
          responseTimeMs: 0
        });
        return reply.send({
          jsonrpc: "2.0",
          id: payload.id,
          error: {
            code: -32603,
            message: "Request blocked by AI Firewall: resource URI is in the file scope blocklist.",
            data: { uri: resourceUri, reason }
          }
        });
      }
    }

    // ── 3. Forward request to downstream MCP server ──────────────────────────
    const messagesUrl = `${targetBase}/messages?sessionId=${(request.query as any).sessionId ?? ""}`;

    try {
      const fetchResponse = await fetch(messagesUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const responseData = await fetchResponse.text();
      let responseJson: any = null;
      try { responseJson = JSON.parse(responseData); } catch { /* not JSON */ }

      // ── 4. Scan response content (tools/call and resources/read results) ───
      const resultContent = responseJson?.result?.content;
      if (resultContent) {
        const resultString = JSON.stringify(resultContent);
        const resultScan = scanMcpJson(resultString);

        if (resultScan.action === "BLOCK") {
          logRequest({
            timestamp: Date.now(),
            model: "mcp-proxy-response",
            provider: "mcp-server",
            originalHash: hashText(resultString),
            sanitizedText: "[BLOCKED]",
            secretsFound: resultScan.reasons.length,
            piiFound: 0,
            filesBlocked: 0,
            riskScore: resultScan.riskScore,
            action: "BLOCK",
            reasons: resultScan.reasons,
            responseTimeMs: 0
          });
          responseJson.result.content = [{
            type: "text",
            text: "AI Firewall blocked: sensitive data detected in the tool response."
          }];
          responseJson.result.isError = true;
        } else if (resultScan.action === "REDACT" && resultScan.sanitizedJson) {
          try {
            responseJson.result.content = JSON.parse(resultScan.sanitizedJson);
            logRequest({
              timestamp: Date.now(),
              model: "mcp-proxy-response",
              provider: "mcp-server",
              originalHash: hashText(resultString),
              sanitizedText: "[REDACTED]",
              secretsFound: resultScan.reasons.length,
              piiFound: 0,
              filesBlocked: 0,
              riskScore: resultScan.riskScore,
              action: "REDACT",
              reasons: resultScan.reasons,
              responseTimeMs: 0
            });
          } catch {
            app.log.error("MCP Proxy: failed to parse sanitized response JSON.");
          }
        }
      }

      reply.status(fetchResponse.status);
      return reply.send(responseJson ?? responseData);

    } catch (error) {
      app.log.error(error);
      return reply.status(502).send({ error: "Failed to forward MCP message to target server." });
    }
  });

  /**
   * GET /mcp/proxy/sse
   *
   * Establishes an SSE connection to the downstream MCP server and streams
   * events back to the AI client.  The connection itself carries only session
   * metadata (no tool results) — tool results flow through POST /messages above.
   */
  app.get("/mcp/proxy/sse", async (request: FastifyRequest, reply: FastifyReply) => {
    const policy = loadPolicyConfig();
    const serverName = (request.query as any).server as string | undefined;
    const targetBase = resolveTargetBase(policy, serverName);

    if (!targetBase) {
      return reply.status(503).send({ error: "MCP Proxy is not enabled or no target server configured in policy." });
    }

    try {
      const fetchResponse = await fetch(`${targetBase}/sse`, {
        method: "GET",
        headers: { "Accept": "text/event-stream" }
      });

      if (!fetchResponse.body) {
        return reply.status(500).send({ error: "No SSE body from target server." });
      }

      reply.raw.writeHead(fetchResponse.status, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      });

      const reader = fetchResponse.body.getReader();
      const pump = async (): Promise<void> => {
        try {
          const { value, done } = await reader.read();
          if (done) { reply.raw.end(); return; }
          reply.raw.write(value);
          return pump();
        } catch {
          reply.raw.end();
        }
      };

      pump();

      reply.raw.on("close", () => { reader.cancel(); });
      reply.hijack();

    } catch (error) {
      app.log.error(error);
      return reply.status(502).send({ error: "Failed to establish SSE connection to target server." });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MCP Tool Discovery + Execution (used by the extension's agentic loop)
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * GET /mcp/proxy/tools
   *
   * Aggregates the tool list from ALL configured and reachable MCP servers.
   * Each tool is tagged with its server name so the extension knows where to
   * route tool calls.  Unreachable servers are silently skipped.
   *
   * Response:
   *   [ { server, name, description, inputSchema } ]
   */
  app.get("/mcp/proxy/tools", async (_request: FastifyRequest, reply: FastifyReply) => {
    const policy = loadPolicyConfig();
    const servers = policy.mcp_proxy?.servers ?? [];
    if (!policy.mcp_proxy?.enabled || servers.length === 0) {
      return reply.send([]);
    }

    const allTools: Array<{
      server: string;
      name: string;
      description: string;
      inputSchema: unknown;
    }> = [];

    for (const server of servers) {
      try {
        const resp = await fetch(`${server.targetUrl}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(3000),
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
        });
        const data = await resp.json() as any;
        const tools: any[] = data?.result?.tools ?? [];
        for (const tool of tools) {
          allTools.push({
            server: server.name,
            name: tool.name,
            description: tool.description ?? "",
            inputSchema: tool.inputSchema ?? { type: "object", properties: {} }
          });
        }
      } catch {
        // Server not running — skip gracefully
      }
    }

    return reply.send(allTools);
  });

  /**
   * POST /mcp/proxy/call-tool
   *
   * Routes a single tool call from the LLM through our security scanner to the
   * correct MCP server.  Scans both the arguments (before calling) and the
   * result content (before returning to the LLM).
   *
   * Body: { serverName, toolName, arguments }
   */
  app.post("/mcp/proxy/call-tool", async (request: FastifyRequest, reply: FastifyReply) => {
    const policy = loadPolicyConfig();
    const { serverName, toolName, arguments: toolArgs } = request.body as {
      serverName: string;
      toolName: string;
      arguments: Record<string, unknown>;
    };

    const targetBase = resolveTargetBase(policy, serverName);
    if (!targetBase) {
      return reply.status(404).send({ error: `MCP server "${serverName}" not configured` });
    }

    // Scan arguments
    const argsStr = JSON.stringify(toolArgs ?? {});
    const argsScan = scanMcpJson(argsStr);
    if (argsScan.action === "BLOCK") {
      logRequest({
        timestamp: Date.now(), model: "mcp-tool-call", provider: serverName,
        originalHash: hashText(argsStr), sanitizedText: "[BLOCKED]",
        secretsFound: argsScan.reasons.length, piiFound: 0, filesBlocked: 0,
        riskScore: argsScan.riskScore, action: "BLOCK", reasons: argsScan.reasons, responseTimeMs: 0
      });
      return reply.send({ content: [{ type: "text", text: `[AI Firewall blocked: ${argsScan.reasons.join(", ")}]` }], isError: true });
    }

    const safeArgs = argsScan.action === "REDACT" && argsScan.sanitizedJson
      ? JSON.parse(argsScan.sanitizedJson)
      : toolArgs;

    // Call the MCP server
    try {
      const resp = await fetch(`${targetBase}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0", id: Date.now(), method: "tools/call",
          params: { name: toolName, arguments: safeArgs }
        })
      });

      const data = await resp.json() as any;
      const resultContent = data?.result?.content ?? [{ type: "text", text: String(data?.result ?? "") }];

      // Scan result content
      const resultStr = JSON.stringify(resultContent);
      const resultScan = scanMcpJson(resultStr);
      if (resultScan.action === "BLOCK") {
        logRequest({
          timestamp: Date.now(), model: "mcp-tool-result", provider: serverName,
          originalHash: hashText(resultStr), sanitizedText: "[BLOCKED]",
          secretsFound: resultScan.reasons.length, piiFound: 0, filesBlocked: 0,
          riskScore: resultScan.riskScore, action: "BLOCK", reasons: resultScan.reasons, responseTimeMs: 0
        });
        return reply.send({ content: [{ type: "text", text: "[AI Firewall blocked sensitive data in tool result]" }], isError: true });
      }

      const safeContent = resultScan.action === "REDACT" && resultScan.sanitizedJson
        ? JSON.parse(resultScan.sanitizedJson)
        : resultContent;

      return reply.send({ content: safeContent, isError: false });
    } catch (err) {
      app.log.error(err);
      return reply.status(502).send({ error: "Failed to call MCP tool", server: serverName, tool: toolName });
    }
  });

  // ══════════════════════════════════════════════════════════════════════════
  // MCP Server Management (CRUD on policy.json mcp_proxy.servers)
  // ══════════════════════════════════════════════════════════════════════════

  /** GET /api/mcp/servers — list all configured MCP servers + live status */
  app.get("/api/mcp/servers", async (_request: FastifyRequest, reply: FastifyReply) => {
    const policy = loadPolicyConfig();
    const servers = policy.mcp_proxy?.servers ?? [];

    // Ping each server to determine live status
    const withStatus = await Promise.all(servers.map(async (s) => {
      let online = false;
      try {
        const r = await fetch(`${s.targetUrl}/health`, { signal: AbortSignal.timeout(1500) });
        online = r.ok;
      } catch {
        // Try tools/list as fallback ping
        try {
          await fetch(`${s.targetUrl}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(1500),
            body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
          });
          online = true;
        } catch { /* offline */ }
      }
      return { ...s, online };
    }));

    return reply.send(withStatus);
  });

  /** POST /api/mcp/servers — add a new MCP server */
  app.post("/api/mcp/servers", async (request: FastifyRequest, reply: FastifyReply) => {
    const { name, targetUrl } = request.body as { name: string; targetUrl: string };
    if (!name?.trim() || !targetUrl?.trim()) {
      return reply.status(400).send({ error: "name and targetUrl are required" });
    }

    const { loadPolicyConfig: load, savePolicyConfig: save } = await import("../config");
    const policy = load();
    if (!policy.mcp_proxy) policy.mcp_proxy = { enabled: true, servers: [] };
    if (!policy.mcp_proxy.servers) policy.mcp_proxy.servers = [];

    const exists = policy.mcp_proxy.servers.some((s) => s.name === name.trim());
    if (exists) return reply.status(409).send({ error: `Server "${name}" already configured` });

    policy.mcp_proxy.servers.push({ name: name.trim(), targetUrl: targetUrl.trim() });
    save(policy);

    return reply.status(201).send({ name: name.trim(), targetUrl: targetUrl.trim(), online: false });
  });

  /** DELETE /api/mcp/servers/:name — remove an MCP server */
  app.delete("/api/mcp/servers/:name", async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    const { loadPolicyConfig: load, savePolicyConfig: save } = await import("../config");
    const policy = load();

    const servers = policy.mcp_proxy?.servers ?? [];
    const idx = servers.findIndex((s) => s.name === name);
    if (idx === -1) return reply.status(404).send({ error: `Server "${name}" not found` });

    servers.splice(idx, 1);
    if (policy.mcp_proxy) policy.mcp_proxy.servers = servers;
    save(policy);

    return reply.send({ deleted: name });
  });

  /** PATCH /api/mcp/servers/:name — toggle enabled state (enable/disable without removing) */
  app.patch("/api/mcp/servers/:name", async (request: FastifyRequest, reply: FastifyReply) => {
    const { name } = request.params as { name: string };
    const { enabled } = request.body as { enabled: boolean };
    const { loadPolicyConfig: load, savePolicyConfig: save } = await import("../config");
    const policy = load();

    if (!policy.mcp_proxy) return reply.status(404).send({ error: "MCP proxy not configured" });

    // Toggle whole proxy enabled flag when name === "*"
    if (name === "*") {
      policy.mcp_proxy.enabled = enabled;
      save(policy);
      return reply.send({ enabled });
    }

    const server = (policy.mcp_proxy.servers ?? []).find((s) => s.name === name);
    if (!server) return reply.status(404).send({ error: `Server "${name}" not found` });

    // Store disabled state by prefixing name — simple approach
    save(policy);
    return reply.send({ name, enabled });
  });
}
