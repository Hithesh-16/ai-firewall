import assert from "node:assert";
import Fastify from "fastify";
import { registerMcpProxyRoutes } from "../routes/mcpProxy.route";

// Override policy so tests don't need a real policy.json on disk
const configModule = require("../config");
const originalLoadPolicyConfig = configModule.loadPolicyConfig;

configModule.loadPolicyConfig = () => {
  const policy = originalLoadPolicyConfig();
  return {
    ...policy,
    mcp_proxy: {
      enabled: true,
      servers: [{ name: "filesystem", targetUrl: "http://127.0.0.1:3001" }]
    },
    prompt_injection: { enabled: true, threshold: 60 },
    file_scope: {
      mode: "blocklist",
      allowlist: [],
      blocklist: ["**/.env", "**/*.pem"],
      max_file_size_kb: 50,
      scan_on_open: false,
      scan_on_send: true
    }
  };
};

async function runMcpProxyTest() {
  console.log("Starting MCP Proxy Gateway Integration Tests...\n");

  // ── Mock downstream MCP tool server ────────────────────────────────────────
  const targetApp = Fastify();
  let receivedArgument: any = null;

  targetApp.post("/messages", async (req, reply) => {
    receivedArgument = (req.body as any)?.params?.arguments;
    return reply.send({
      jsonrpc: "2.0",
      id: (req.body as any).id,
      result: {
        content: [
          { type: "text", text: "Found user: john.doe@example.com with phone +15551234567" }
        ]
      }
    });
  });

  await targetApp.listen({ port: 3001, host: "127.0.0.1" });
  console.log("Mock Target Server running on port 3001");

  // ── Proxy server ───────────────────────────────────────────────────────────
  const proxyApp = Fastify();
  await registerMcpProxyRoutes(proxyApp);
  await proxyApp.listen({ port: 8089, host: "127.0.0.1" });
  console.log("Mock Proxy Server running on port 8089\n");

  const BASE = "http://127.0.0.1:8089/mcp/proxy/messages?server=filesystem";

  let passed = 0;
  let failed = 0;

  try {
    // ── Test A: Block tools/call with AWS Key in arguments ────────────────────
    console.log("Test A: Block request with AWS Key in tool arguments");
    const resA = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: {
          name: "db_query",
          arguments: { query: "SELECT * FROM users", token: "AKIAIOSFODNN7EXAMPLE" }
        }
      })
    }).then((r) => r.json());

    try {
      assert.ok(resA.error, "Should have an error field");
      assert.ok(
        resA.error.message.includes("blocked") || resA.error.message.includes("Blocked"),
        `Error should mention 'blocked', got: ${resA.error.message}`
      );
      console.log("  ✓ AWS Key correctly blocked from leaving the machine");
      passed++;
    } catch (e: any) {
      console.log("  ✗ Failed:", e.message, "\n    Response:", JSON.stringify(resA));
      failed++;
    }

    // ── Test B: Redact Email in tool arguments and in the response ────────────
    console.log("Test B: Redact Email in tool request and response");
    const resB = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "tools/call",
        params: { name: "db_query", arguments: { query: "Find test@test.com" } }
      })
    }).then((r) => r.json());

    try {
      assert.strictEqual(
        receivedArgument?.query,
        "Find [REDACTED_EMAIL]",
        `Arguments sent to server should have redacted email, got: ${receivedArgument?.query}`
      );
      console.log("  ✓ Email correctly redacted in request payload to target server");
      passed++;
    } catch (e: any) {
      console.log("  ✗ Failed (request redaction):", e.message);
      failed++;
    }

    try {
      const text = resB.result?.content?.[0]?.text ?? "";
      assert.ok(!text.includes("john.doe@example.com"), "Raw email should not reach client");
      assert.ok(text.includes("[REDACTED_EMAIL]"), "Redacted token should appear in response");
      console.log("  ✓ Email correctly redacted from target server response before reaching client");
      passed++;
    } catch (e: any) {
      console.log("  ✗ Failed (response redaction):", e.message, "\n    Content:", resB.result?.content);
      failed++;
    }

    // ── Test C: Block resources/read on a blocklisted file path ──────────────
    console.log("Test C: Block resources/read for a blocked file path (.env)");
    const resC = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 3, method: "resources/read",
        params: { uri: "file:///workspace/project/.env" }
      })
    }).then((r) => r.json());

    try {
      assert.ok(resC.error, "Should have an error field");
      assert.ok(
        resC.error.message.includes("blocked") || resC.error.message.includes("Blocked"),
        `Error should mention 'blocked', got: ${resC.error.message}`
      );
      console.log("  ✓ .env file correctly blocked from being read into AI context");
      passed++;
    } catch (e: any) {
      console.log("  ✗ Failed:", e.message, "\n    Response:", JSON.stringify(resC));
      failed++;
    }

    // ── Test D: Block resources/read for a .pem private key ──────────────────
    console.log("Test D: Block resources/read for private key file (*.pem)");
    const resD = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 4, method: "resources/read",
        params: { uri: "file:///workspace/project/server.pem" }
      })
    }).then((r) => r.json());

    try {
      assert.ok(resD.error, "Should have an error field");
      console.log("  ✓ .pem file correctly blocked from being read into AI context");
      passed++;
    } catch (e: any) {
      console.log("  ✗ Failed:", e.message, "\n    Response:", JSON.stringify(resD));
      failed++;
    }

  } finally {
    await proxyApp.close();
    await targetApp.close();

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runMcpProxyTest().catch(console.error);
