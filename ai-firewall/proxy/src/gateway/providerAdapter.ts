export type ChatMessage = { role: string; content: string };

export type SendOptions = {
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  metadata?: Record<string, unknown>;
};

export type ModelInfo = {
  id: string;
  displayName: string;
  maxContextTokens: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
  supportsStreaming: boolean;
  supportsFunctions?: boolean;
};

export interface ProviderAdapter {
  providerId: number;
  getModels(): Promise<ModelInfo[]>;
  getModelInfo(model: string): Promise<ModelInfo | null>;
  estimateTokens(model: string, messages: ChatMessage[]): Promise<{ inputTokens: number; outputTokens: number }>;
  sendChat(
    model: string,
    messages: ChatMessage[],
    opts?: SendOptions
  ): Promise<{ choices: Array<{ message?: ChatMessage }>; meta?: any }>;
  streamChat?(
    model: string,
    messages: ChatMessage[],
    opts: SendOptions,
    onDelta: (delta: string) => void
  ): Promise<void>;
  normalizeResponse(raw: unknown): { choices?: Array<{ message?: ChatMessage }>; _providerMeta?: any };
}

