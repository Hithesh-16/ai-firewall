import { ProviderAdapter, ChatMessage, ModelInfo, SendOptions } from "../providerAdapter";

export class AnthropicAdapter implements ProviderAdapter {
  providerId: number;
  baseUrl: string;
  apiKey?: string;

  constructor(providerId: number, baseUrl = "https://api.anthropic.com", apiKey?: string) {
    this.providerId = providerId;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey ?? process.env.ANTHROPIC_API_KEY;
  }

  async getModels(): Promise<ModelInfo[]> {
    // Skeleton: return a default model entry
    return [{ id: "claude-3", displayName: "Claude 3", maxContextTokens: 9000, inputCostPer1k: 0.03, outputCostPer1k: 0.06, supportsStreaming: true }];
  }

  async getModelInfo(model: string): Promise<ModelInfo | null> {
    const models = await this.getModels();
    return models.find((m) => m.id === model) ?? null;
  }

  async estimateTokens(_model: string, messages: ChatMessage[]) {
    const json = JSON.stringify(messages);
    const inputTokens = Math.max(1, Math.floor(json.length / 4));
    return { inputTokens, outputTokens: Math.max(64, Math.floor(inputTokens / 2)) };
  }

  async sendChat(model: string, messages: ChatMessage[], opts?: SendOptions) {
    // Map messages to Anthropic expected format (simple mapping)
    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    const body = { model, prompt, max_tokens: opts?.maxTokens ?? 512 };
    const res = await fetch(`${this.baseUrl}/v1/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    // Normalize to our standard shape
    const content = data?.completion ?? data?.text ?? "";
    return { choices: [{ message: { role: "assistant", content } }], meta: data };
  }

  async streamChat(_model: string, _messages: ChatMessage[], _opts: SendOptions, _onDelta: (delta: string) => void) {
    throw new Error("streamChat not implemented in AnthropicAdapter skeleton");
  }

  normalizeResponse(raw: any) {
    const choices = (raw?.choices ?? []).map((c: any) => ({ message: c.message ? { role: c.message.role, content: c.message.content } : undefined }));
    return { choices, _providerMeta: raw };
  }
}

