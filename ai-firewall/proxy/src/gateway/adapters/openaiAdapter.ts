import { ProviderAdapter, ChatMessage, ModelInfo, SendOptions } from "../providerAdapter";

export class OpenAIAdapter implements ProviderAdapter {
  providerId: number;
  baseUrl: string;
  apiKey?: string;

  constructor(providerId: number, baseUrl = "https://api.openai.com/v1", apiKey?: string) {
    this.providerId = providerId;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey ?? process.env.OPENAI_API_KEY;
  }

  async getModels(): Promise<ModelInfo[]> {
    // Ideally call GET /v1/models and map to ModelInfo, but keep simple for skeleton
    return [{ id: "gpt-4", displayName: "gpt-4", maxContextTokens: 8192, inputCostPer1k: 0.03, outputCostPer1k: 0.06, supportsStreaming: true }];
  }

  async getModelInfo(model: string): Promise<ModelInfo | null> {
    const models = await this.getModels();
    return models.find((m) => m.id === model) ?? null;
  }

  async estimateTokens(model: string, messages: ChatMessage[]) {
    // Best-effort heuristic: JSON length / 4
    const json = JSON.stringify(messages);
    const inputTokens = Math.max(1, Math.floor(json.length / 4));
    const outputTokens = Math.max(64, Math.floor(inputTokens / 2));
    return { inputTokens, outputTokens };
  }

  async sendChat(model: string, messages: ChatMessage[], opts?: SendOptions) {
    const payload = { model, messages, max_tokens: opts?.maxTokens ?? 512, temperature: opts?.temperature ?? 0.2 };
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
      },
      body: JSON.stringify(payload),
      // timeout and other options could be added
    });
    const data = await res.json();
    return this.normalizeResponse(data);
  }

  async streamChat(_model: string, _messages: ChatMessage[], _opts: SendOptions, _onDelta: (delta: string) => void) {
    throw new Error("streamChat not implemented in skeleton");
  }

  normalizeResponse(raw: any) {
    const choices = (raw?.choices ?? []).map((c: any) => ({ message: c.message ? { role: c.message.role, content: c.message.content } : undefined }));
    return { choices, _providerMeta: raw };
  }
}

