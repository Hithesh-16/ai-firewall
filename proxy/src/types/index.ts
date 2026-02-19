export type Severity = "critical" | "high" | "medium";

export type SecretType =
  | "AWS_KEY"
  | "PRIVATE_KEY"
  | "JWT"
  | "BEARER_TOKEN"
  | "GENERIC_API_KEY"
  | "DATABASE_URL"
  | "GITHUB_TOKEN"
  | "SLACK_TOKEN"
  | "GOOGLE_API_KEY"
  | "AZURE_KEY"
  | "HARDCODED_PASSWORD"
  | "ENV_VARIABLE"
  | "HIGH_ENTROPY";

export type PiiType =
  | "EMAIL"
  | "PHONE"
  | "AADHAAR"
  | "PAN"
  | "SSN"
  | "CREDIT_CARD"
  | "IP_ADDRESS";

export type SecretMatch = {
  type: SecretType;
  value: string;
  position: number;
  length: number;
  severity: Severity;
};

export type PiiMatch = {
  type: PiiType;
  value: string;
  position: number;
  length: number;
  severity: Severity;
};

export type SecretScanResult = {
  hasSecrets: boolean;
  secrets: SecretMatch[];
};

export type PiiScanResult = {
  hasPII: boolean;
  pii: PiiMatch[];
};

export type PolicyRules = {
  block_private_keys: boolean;
  block_aws_keys: boolean;
  block_db_urls: boolean;
  block_github_tokens: boolean;
  redact_emails: boolean;
  redact_phone: boolean;
  redact_jwt: boolean;
  redact_generic_api_keys: boolean;
  allow_source_code: boolean;
  log_all_requests: boolean;
};

export type FileScopeMode = "blocklist" | "allowlist";

export type FileScopeConfig = {
  mode: FileScopeMode;
  blocklist: string[];
  allowlist: string[];
  max_file_size_kb: number;
  scan_on_open: boolean;
  scan_on_send: boolean;
};

export type SeverityThreshold = "critical" | "high" | "medium";

export type PolicyConfig = {
  version: string;
  rules: PolicyRules;
  file_scope: FileScopeConfig;
  blocked_paths: string[];
  severity_threshold: SeverityThreshold;
  smart_routing?: SmartRoutingConfig;
};

export type PolicyDecision = {
  action: "ALLOW" | "BLOCK" | "REDACT";
  reasons: string[];
  riskScore: number;
  filesBlocked: string[];
};

export type FileScopeResult = {
  allowed: boolean;
  path: string;
  reason?: string;
};

export type LogEntry = {
  timestamp: number;
  model: string;
  provider: string;
  originalHash: string;
  sanitizedText: string;
  secretsFound: number;
  piiFound: number;
  filesBlocked: number;
  riskScore: number;
  action: "ALLOW" | "BLOCK" | "REDACT";
  reasons: string[];
  responseTimeMs: number;
};

export type ChatCompletionMessage = {
  role: string;
  content: string;
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatCompletionMessage[];
  metadata?: {
    filePaths?: string[];
  };
};

// --- Phase 2 types ---

export type SmartRoutingTarget = "local_llm" | "cloud_redacted" | "cloud_direct";

export type SmartRoutingRoute = {
  condition: string;
  target: SmartRoutingTarget;
};

export type LocalLlmConfig = {
  provider: string;
  model: string;
  endpoint: string;
};

export type SmartRoutingConfig = {
  enabled: boolean;
  routes: SmartRoutingRoute[];
  local_llm: LocalLlmConfig;
};

export type RouteDecision = {
  target: SmartRoutingTarget;
  providerUrl: string;
  model: string;
  requiresRedaction: boolean;
  isLocal: boolean;
};

export type LeakFinding = {
  severity: Severity;
  category: string;
  detail: string;
  filePath: string;
  line?: number;
};

export type LeakSimulationReport = {
  timestamp: number;
  filesAnalyzed: number;
  filesExcluded: number;
  overallRisk: Severity | "low";
  findings: LeakFinding[];
  recommendations: string[];
};

export type StatsResponse = {
  totalRequests: number;
  blocked: number;
  redacted: number;
  allowed: number;
  avgRiskScore: number;
  secretsByType: Record<string, number>;
  requestsByDay: Array<{ date: string; count: number }>;
};

// --- Phase 3 types ---

export type Role = "admin" | "security_lead" | "developer" | "auditor";

export type User = {
  id: number;
  email: string;
  name: string;
  role: Role;
  orgId: number | null;
  createdAt: number;
  updatedAt: number;
};

export type Organization = {
  id: number;
  name: string;
  slug: string;
  createdAt: number;
};

export type ApiToken = {
  id: number;
  userId: number;
  tokenHash: string;
  name: string;
  lastUsedAt: number | null;
  createdAt: number;
  expiresAt: number | null;
};

export type AuthContext = {
  user: User;
  token: ApiToken;
};

export type ExportFormat = "csv" | "json";

export type ExportFilter = {
  startDate?: number;
  endDate?: number;
  action?: "ALLOW" | "BLOCK" | "REDACT";
  minRiskScore?: number;
};

// --- Phase 4 types ---

export type Provider = {
  id: number;
  name: string;
  slug: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Model = {
  id: number;
  providerId: number;
  modelName: string;
  displayName: string;
  inputCostPer1k: number;
  outputCostPer1k: number;
  maxContextTokens: number;
  enabled: boolean;
};

export type LimitType = "requests" | "tokens" | "dollars";
export type ResetPeriod = "daily" | "weekly" | "monthly";

export type CreditConfig = {
  id: number;
  providerId: number | null;
  modelId: number | null;
  limitType: LimitType;
  totalLimit: number;
  usedAmount: number;
  resetPeriod: ResetPeriod;
  resetDate: number;
  hardLimit: boolean;
  createdAt: number;
};

export type CreditCheck = {
  allowed: boolean;
  remaining: number;
  limitType: LimitType;
  message?: string;
};

export type UsageRecord = {
  id?: number;
  logId: number | null;
  providerId: number;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: number;
};

export type GatewayRouteDecision = {
  provider: Provider;
  model: Model;
  decryptedKey: string;
  providerUrl: string;
  creditCheck: CreditCheck;
  isLocal: boolean;
};
