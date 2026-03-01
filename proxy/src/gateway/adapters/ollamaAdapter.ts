import { ProviderAdapter, ChatMessage, ModelInfo, SendOptions } from "../providerAdapter";

export class OllamaAdapter implements ProviderAdapter {
  providerId: number;
  baseUrl: string;

  constructor(providerId: number, baseUrl = "http://localhost:11434") {
    this.providerId = providerId;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async getModels(): Promise<ModelInfo[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models`);
      const list = await res.json();
      return (list ?? []).map((m: any) => ({ id: m.name, displayName: m.name, maxContextTokens: m.context ?? 8192, inputCostPer1k: 0, outputCostPer1k: 0, supportsStreaming: true }));
    } catch {
      return [{ id: "local-llm", displayName: "local-llm", maxContextTokens: 8192, inputCostPer1k: 0, outputCostPer1k: 0, supportsStreaming: true }];
    }
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

  async sendChat(model: string, messages: ChatMessage[], _opts?: SendOptions) {
    const prompt = messages.map((m) => `${m.role}: ${m.content}`).join("\n\n");
    const res = await fetch(`${this.baseUrl}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] })
    });
    const data = await res.json();
    const content = data?.response ?? data?.text ?? "";
    return { choices: [{ message: { role: "assistant", content } }], meta: data };
  }

  async streamChat(_model: string, _messages: ChatMessage[], _opts: SendOptions, _onDelta: (delta: string) => void) {
    throw new Error("streamChat not implemented for OllamaAdapter skeleton");
  }

  normalizeResponse(raw: any) {
    const choices = (raw?.choices ?? []).map((c: any) => ({ message: c.message ? { role: c.message.role, content: c.message.content } : undefined }));
    return { choices, _providerMeta: raw };
  }
}

