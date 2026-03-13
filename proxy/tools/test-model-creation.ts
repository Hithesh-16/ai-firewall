import Fastify from "fastify";
import { registerProviderRoutes } from "../src/routes/provider.route";
import db from "../src/db/database";

async function run() {
  const app = Fastify();
  await registerProviderRoutes(app);

  // We bypass auth for testing by decorating request, or we can just mock the auth middleware.
  // Actually, wait, the authMiddleware relies on headers. We can provide a mocked localhost request.
  // We'll just start the server and use localhost, which bypasses auth via `requireAuthOrLocalhost`.

  await app.listen({ port: 8090, host: "127.0.0.1" });
  console.log("Test server running on port 8090");

  let passed = 0;
  let failed = 0;

  try {
    // Get Provider IDs
    const openaiRes = await fetch("http://127.0.0.1:8090/api/providers").then(r => r.json());
    const openaiProvider = openaiRes.find((p: any) => p.slug === "openai");
    const ollamaProvider = openaiRes.find((p: any) => p.slug === "ollama");

    if (!openaiProvider || !ollamaProvider) {
      console.log("Missing providers for test");
      process.exit(1);
    }

    // Test 1: Try adding to OpenAI (should fail with 403)
    console.log("Test 1: Prevent model creation on Cloud Provider");
    const res1 = await fetch(`http://127.0.0.1:8090/api/providers/${openaiProvider.id}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-role": "admin" },
      body: JSON.stringify({ modelName: "test-cloud-model" })
    });
    const body1 = await res1.json();
    if (res1.status === 403 && body1.error.includes("local providers")) {
      console.log("  ✓ Prevented cloud model creation");
      passed++;
    } else {
      console.log("  ✗ Failed:", res1.status, body1);
      failed++;
    }

    // Test 2: Try adding a duplicate model name to Ollama (e.g. gpt-4o) (should fail with 409)
    console.log("Test 2: Prevent duplicate model name globally");
    const res2 = await fetch(`http://127.0.0.1:8090/api/providers/${ollamaProvider.id}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-role": "admin" },
      body: JSON.stringify({ modelName: "gpt-4o" })
    });
    const body2 = await res2.json();
    if (res2.status === 409 && body2.error.includes("already exists")) {
      console.log("  ✓ Prevented duplicate model name");
      passed++;
    } else {
      console.log("  ✗ Failed:", res2.status, body2);
      failed++;
    }

    // Test 3: Try adding a valid local model to Ollama
    console.log("Test 3: Allow valid local model creation");
    const testName = "test-local-model-" + Date.now();
    const res3 = await fetch(`http://127.0.0.1:8090/api/providers/${ollamaProvider.id}/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-user-role": "admin" },
      body: JSON.stringify({ modelName: testName })
    });
    const body3 = await res3.json();
    if (res3.status === 201 && body3.modelName === testName) {
      console.log("  ✓ Allowed local model creation");
      passed++;
    } else {
      console.log("  ✗ Failed:", res3.status, body3);
      failed++;
    }

  } finally {
    await app.close();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

run().catch(console.error);
