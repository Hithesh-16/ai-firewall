import { spawn } from "node:child_process";
import Fastify from "fastify";
import cors from "@fastify/cors";

/**
 * MCP Bridge Tool
 * 
 * Usage: ts-node mcp-bridge.ts <port> <command> [args...]
 * Example: ts-node mcp-bridge.ts 3001 npx -y @modelcontextprotocol/server-filesystem /Users/me/Documents
 */

const [,, portStr, command, ...args] = process.argv;

if (!portStr || !command) {
  console.log("Usage: ts-node mcp-bridge.ts <port> <command> [args...]");
  process.exit(1);
}

const port = Number(portStr);
const app = Fastify({ logger: true });

app.register(cors);

// Start the stdio MCP server process
const child = spawn(command, args, {
  stdio: ["pipe", "pipe", "inherit"],
});

let buffer = "";
const pendingResponses = new Map<string | number, (data: any) => void>();
const sseClients = new Set<(msg: string) => void>();

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id !== undefined) {
        // This is a response to a request we sent
        const resolve = pendingResponses.get(msg.id);
        if (resolve) {
          resolve(msg);
          pendingResponses.delete(msg.id);
        }
      } else {
        // This is a notification or event (e.g. tools/list updates)
        // Send to all SSE clients
        const sseMsg = `data: ${JSON.stringify(msg)}\n\n`;
        sseClients.forEach((send) => send(sseMsg));
      }
    } catch (e) {
      console.error("Failed to parse MCP message:", line, e);
    }
  }
});

app.post("/messages", async (request, reply) => {
  const payload = request.body as any;
  const id = payload.id;

  if (id === undefined) {
    return reply.status(400).send({ error: "JSON-RPC id is required" });
  }

  return new Promise((resolve) => {
    pendingResponses.set(id, (data) => {
      resolve(reply.send(data));
    });
    child.stdin.write(JSON.stringify(payload) + "\n");
  });
});

app.get("/sse", async (request, reply) => {
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });

  const send = (msg: string) => {
    reply.raw.write(msg);
  };

  sseClients.add(send);

  request.raw.on("close", () => {
    sseClients.delete(send);
  });
});

app.get("/health", async () => {
  return { status: "ok", pid: child.pid };
});

app.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log(`MCP Bridge running at http://localhost:${port}`);
  console.log(`Bridging to: ${command} ${args.join(" ")}`);
});
