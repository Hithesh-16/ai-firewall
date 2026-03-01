import { ProviderAdapter, ChatMessage, ModelInfo, SendOptions } from "../providerAdapter";

export class GeminiAdapter implements ProviderAdapter {
  providerId: number;
  baseUrl: string;
  apiKey?: string;

  constructor(providerId: number, baseUrl = "https://generativelanguage.googleapis.com/v1beta2", apiKey?: string) {
    this.providerId = providerId;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiKey = apiKey ?? process.env.GOOGLE_API_KEY;
  }

  async getModels(): Promise<ModelInfo[]> {
    return [{ id: "gemini-pro", displayName: "Gemini Pro", maxContextTokens: 8192, inputCostPer1k: 0.04, outputCostPer1k: 0.08, supportsStreaming: false }];
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
    const prompt = messages.map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const body = { instances: [{ content: messages.map((m) => m.content).join("\\n\\n") }] };
    const url = `${this.baseUrl}/models/${model}:generate?key=${this.apiKey}`;
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? data?.output ?? "";
    return { choices: [{ message: { role: "assistant", content: text } }], meta: data };
  }

  async streamChat(_model: string, _messages: ChatMessage[], _opts: SendOptions, _onDelta: (delta: string) => void) {
    throw new Error("streamChat not implemented for GeminiAdapter skeleton");
  }

  normalizeResponse(raw: any) {
    const choices = (raw?.choices ?? []).map((c: any) => ({ message: c.message ? { role: c.message.role, content: c.message.content } : undefined }));
    return { choices, _providerMeta: raw };
  }
}

