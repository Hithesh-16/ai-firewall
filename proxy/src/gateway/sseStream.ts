/**
 * sseStream.ts — Utility for safely piping upstream SSE responses to the client.
 *
 * Problem this solves:
 *   When proxying SSE (Server-Sent Events) from providers like Groq, OpenAI, or Anthropic,
 *   naive piping copies the upstream `Content-Encoding` header (gzip/br). The Node.js
 *   http module on the extension side does NOT auto-decompress, so the client receives
 *   compressed bytes it cannot parse as `data: {...}` SSE lines — resulting in silence.
 *
 * Solution:
 *   1. Add `Accept-Encoding: identity` on all upstream streaming requests.
 *   2. Set correct SSE headers ourselves, not from upstream.
 *   3. Use `reply.raw.flushHeaders()` so Fastify writes headers immediately.
 */

import { FastifyReply } from "fastify";

/**
 * Set SSE-appropriate response headers and flush them immediately.
 * Must be called before piping data so the client can start reading.
 */
export function writeSseHeaders(reply: FastifyReply): void {
  reply.raw.setHeader("Content-Type", "text/event-stream");
  reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
  reply.raw.setHeader("Connection", "keep-alive");
  reply.raw.setHeader("X-Accel-Buffering", "no"); // disable nginx proxy buffering
  reply.raw.flushHeaders();
}

/**
 * Pipe an upstream readable stream (SSE from a provider) through to the client reply.
 *
 * @param upstream - The Axios stream response data (NodeJS.ReadableStream)
 * @param reply    - The Fastify reply object
 * @returns A promise that resolves when the upstream stream ends
 */
export function pipeUpstreamSSE(
  upstream: NodeJS.ReadableStream,
  reply: FastifyReply
): Promise<void> {
  writeSseHeaders(reply);
  return new Promise<void>((resolve, reject) => {
    upstream.on("end", resolve);
    upstream.on("error", reject);
    upstream.pipe(reply.raw, { end: true });
  });
}

/**
 * Build upstream request headers for a streaming call.
 * Adds `Accept-Encoding: identity` to prevent the provider from compressing the SSE stream.
 *
 * @param base - The base headers (Authorization, Content-Type, etc.)
 * @returns Headers with compression disabled
 */
export function streamingHeaders(base: Record<string, string>): Record<string, string> {
  return { ...base, "Accept-Encoding": "identity" };
}
