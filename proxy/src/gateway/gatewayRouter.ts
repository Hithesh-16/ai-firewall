import { env } from "../config";
import { GatewayRouteDecision, Model, Provider } from "../types";
import { checkCredit } from "./creditService";
import { findModelByName } from "./modelService";
import { decryptProviderKey, getProviderById } from "./providerService";

const PROVIDER_COMPLETIONS_PATHS: Record<string, string> = {
  openai: "/v1/chat/completions",
  anthropic: "/v1/messages",
  google: "/v1beta/models/{model}:generateContent",
  ollama: "/api/chat"
};

function buildProviderUrl(provider: Provider, model: Model): string {
  const base = provider.baseUrl.replace(/\/+$/, "");
  const slug = provider.slug.toLowerCase();

  if (slug.includes("ollama") || slug === "local") {
    return `${base}/api/chat`;
  }
  if (slug.includes("anthropic") || slug.includes("claude")) {
    return `${base}/v1/messages`;
  }
  if (slug.includes("google") || slug.includes("gemini")) {
    return `${base}/v1beta/models/${model.modelName}:generateContent`;
  }

  return `${base}/v1/chat/completions`;
}

function isLocalProvider(provider: Provider): boolean {
  const slug = provider.slug.toLowerCase();
  return slug.includes("ollama") || slug === "local";
}

export function resolveGatewayRoute(requestedModel: string): GatewayRouteDecision | null {
  const model = findModelByName(requestedModel);
  if (!model) return null;

  const provider = getProviderById(model.providerId);
  if (!provider || !provider.enabled || !model.enabled) return null;

  const creditResult = checkCredit(provider.id, model.id);

  let decryptedKey = "";
  if (!isLocalProvider(provider)) {
    try {
      decryptedKey = decryptProviderKey(provider);
    } catch {
      return null;
    }
  }

  return {
    provider,
    model,
    decryptedKey,
    providerUrl: buildProviderUrl(provider, model),
    creditCheck: creditResult,
    isLocal: isLocalProvider(provider)
  };
}

/**
 * Falls back to legacy routing when no gateway provider is configured for the model.
 * Uses OPENAI_API_KEY from env + PROVIDER_URL, just like pre-Phase 4 behavior.
 */
export function legacyFallback(
  requestedModel: string,
  apiKeyHeader?: string
): { providerUrl: string; apiKey: string | undefined; isLocal: boolean } {
  const apiKey = env.OPENAI_API_KEY || apiKeyHeader;
  return {
    providerUrl: env.PROVIDER_URL,
    apiKey,
    isLocal: false
  };
}

export function formatAnthropicPayload(
  model: string,
  messages: Array<{ role: string; content: string }>
): unknown {
  const systemMessage = messages.find((m) => m.role === "system");
  const chatMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  return {
    model,
    max_tokens: 4096,
    ...(systemMessage ? { system: systemMessage.content } : {}),
    messages: chatMessages
  };
}

export function formatGeminiPayload(
  messages: Array<{ role: string; content: string }>
): unknown {
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));

  return { contents };
}

export function normalizeAnthropicResponse(data: Record<string, unknown>): unknown {
  const content = data.content as Array<{ type: string; text: string }> | undefined;
  const text = content?.[0]?.text ?? "";
  const usage = data.usage as {
    input_tokens?: number;
    output_tokens?: number;
  } | undefined;

  return {
    id: data.id ?? `anthropic-${Date.now()}`,
    object: "chat.completion",
    model: data.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: data.stop_reason ?? "stop"
      }
    ],
    usage: {
      prompt_tokens: usage?.input_tokens ?? 0,
      completion_tokens: usage?.output_tokens ?? 0,
      total_tokens: (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0)
    }
  };
}

export function normalizeGeminiResponse(data: Record<string, unknown>): unknown {
  const candidates = data.candidates as Array<{
    content?: { parts?: Array<{ text: string }> };
  }> | undefined;
  const text = candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  const usageMeta = data.usageMetadata as {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  } | undefined;

  return {
    id: `gemini-${Date.now()}`,
    object: "chat.completion",
    model: "gemini",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: usageMeta?.promptTokenCount ?? 0,
      completion_tokens: usageMeta?.candidatesTokenCount ?? 0,
      total_tokens: usageMeta?.totalTokenCount ?? 0
    }
  };
}

export function extractTokenUsage(
  providerSlug: string,
  responseData: Record<string, unknown>
): { inputTokens: number; outputTokens: number; totalTokens: number } {
  const slug = providerSlug.toLowerCase();

  if (slug.includes("anthropic") || slug.includes("claude")) {
    const usage = responseData.usage as {
      input_tokens?: number;
      output_tokens?: number;
    } | undefined;
    const inp = usage?.input_tokens ?? 0;
    const out = usage?.output_tokens ?? 0;
    return { inputTokens: inp, outputTokens: out, totalTokens: inp + out };
  }

  if (slug.includes("google") || slug.includes("gemini")) {
    const meta = responseData.usageMetadata as {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      totalTokenCount?: number;
    } | undefined;
    return {
      inputTokens: meta?.promptTokenCount ?? 0,
      outputTokens: meta?.candidatesTokenCount ?? 0,
      totalTokens: meta?.totalTokenCount ?? 0
    };
  }

  if (slug.includes("ollama") || slug === "local") {
    return {
      inputTokens: (responseData.prompt_eval_count as number) ?? 0,
      outputTokens: (responseData.eval_count as number) ?? 0,
      totalTokens:
        ((responseData.prompt_eval_count as number) ?? 0) +
        ((responseData.eval_count as number) ?? 0)
    };
  }

  const usage = responseData.usage as {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | undefined;

  return {
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
    totalTokens: usage?.total_tokens ?? 0
  };
}
