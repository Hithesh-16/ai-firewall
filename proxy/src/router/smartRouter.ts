import axios from "axios";
import { env, isStrictLocal } from "../config";
import { PolicyConfig, RouteDecision, SmartRoutingConfig } from "../types";

const DEFAULT_ROUTING: SmartRoutingConfig = {
  enabled: false,
  routes: [
    { condition: "risk_score >= 70", target: "local_llm" },
    { condition: "risk_score >= 30", target: "cloud_redacted" },
    { condition: "default", target: "cloud_direct" }
  ],
  local_llm: {
    provider: "ollama",
    model: "llama3",
    endpoint: "http://localhost:11434"
  }
};

function evaluateCondition(condition: string, riskScore: number): boolean {
  if (condition === "default") return true;

  const match = condition.match(/risk_score\s*(>=|>|<=|<|==)\s*(\d+)/);
  if (!match) return false;

  const [, operator, valueStr] = match;
  const value = Number(valueStr);

  switch (operator) {
    case ">=": return riskScore >= value;
    case ">":  return riskScore > value;
    case "<=": return riskScore <= value;
    case "<":  return riskScore < value;
    case "==": return riskScore === value;
    default:   return false;
  }
}

export async function isLocalLlmAvailable(config: SmartRoutingConfig): Promise<boolean> {
  try {
    const base = config.local_llm.endpoint.replace(/\/+$/, "");
    const response = await axios.get(`${base}/api/tags`, { timeout: 2000 });
    return response.status === 200;
  } catch {
    return false;
  }
}

function ollamaCompletionUrl(config: SmartRoutingConfig): string {
  const base = config.local_llm.endpoint.replace(/\/+$/, "");
  return `${base}/api/chat`;
}

export function resolveRoute(
  riskScore: number,
  requestedModel: string,
  policy: PolicyConfig
): RouteDecision {
  const routing = policy.smart_routing ?? DEFAULT_ROUTING;

  // STRICT_LOCAL: always route to local LLM
  if (isStrictLocal()) {
    return {
      target: "local_llm",
      providerUrl: ollamaCompletionUrl(routing),
      model: routing.local_llm.model,
      requiresRedaction: false,
      isLocal: true
    };
  }

  if (!routing.enabled) {
    return {
      target: "cloud_direct",
      providerUrl: env.PROVIDER_URL,
      model: requestedModel,
      requiresRedaction: false,
      isLocal: false
    };
  }

  for (const route of routing.routes) {
    if (evaluateCondition(route.condition, riskScore)) {
      switch (route.target) {
        case "local_llm":
          return {
            target: "local_llm",
            providerUrl: ollamaCompletionUrl(routing),
            model: routing.local_llm.model,
            requiresRedaction: false,
            isLocal: true
          };
        case "cloud_redacted":
          return {
            target: "cloud_redacted",
            providerUrl: env.PROVIDER_URL,
            model: requestedModel,
            requiresRedaction: true,
            isLocal: false
          };
        case "cloud_direct":
          return {
            target: "cloud_direct",
            providerUrl: env.PROVIDER_URL,
            model: requestedModel,
            requiresRedaction: false,
            isLocal: false
          };
      }
    }
  }

  return {
    target: "cloud_direct",
    providerUrl: env.PROVIDER_URL,
    model: requestedModel,
    requiresRedaction: false,
    isLocal: false
  };
}

export function formatOllamaPayload(
  model: string,
  messages: Array<{ role: string; content: string }>
): unknown {
  return {
    model,
    messages,
    stream: false
  };
}

export function normalizeOllamaResponse(ollamaData: Record<string, unknown>): unknown {
  const message = ollamaData.message as { role?: string; content?: string } | undefined;
  return {
    id: `local-${Date.now()}`,
    object: "chat.completion",
    model: ollamaData.model,
    choices: [
      {
        index: 0,
        message: {
          role: message?.role ?? "assistant",
          content: message?.content ?? ""
        },
        finish_reason: "stop"
      }
    ],
    usage: {
      prompt_tokens: ollamaData.prompt_eval_count ?? 0,
      completion_tokens: ollamaData.eval_count ?? 0,
      total_tokens:
        ((ollamaData.prompt_eval_count as number) ?? 0) +
        ((ollamaData.eval_count as number) ?? 0)
    }
  };
}
