import {
  FileScopeResult,
  PolicyConfig,
  PolicyDecision,
  PiiScanResult,
  SecretScanResult,
  Severity
} from "../types";

const severityScore: Record<Severity, number> = {
  critical: 40,
  high: 20,
  medium: 10
};

function thresholdToNumber(threshold: PolicyConfig["severity_threshold"]): number {
  switch (threshold) {
    case "critical":
      return 80;
    case "high":
      return 60;
    case "medium":
    default:
      return 40;
  }
}

function calculateRisk(secretResult: SecretScanResult, piiResult: PiiScanResult): number {
  const raw =
    secretResult.secrets.reduce((sum, item) => sum + severityScore[item.severity], 0) +
    piiResult.pii.reduce((sum, item) => sum + severityScore[item.severity], 0);

  return Math.min(raw, 100);
}

export function evaluatePolicy(
  secretResult: SecretScanResult,
  piiResult: PiiScanResult,
  policy: PolicyConfig,
  fileScopeResults: FileScopeResult[] = []
): PolicyDecision {
  const reasons: string[] = [];
  const blockedFiles = fileScopeResults.filter((x) => !x.allowed);
  const filesBlocked = blockedFiles.map((x) => x.path);

  if (blockedFiles.length > 0) {
    reasons.push(...blockedFiles.map((x) => x.reason ?? `File blocked: ${x.path}`));
    return {
      action: "BLOCK",
      reasons,
      riskScore: 100,
      filesBlocked
    };
  }

  const hasCriticalSecret = secretResult.secrets.some((s) => s.severity === "critical");
  const hasPrivateKey = secretResult.secrets.some((s) => s.type === "PRIVATE_KEY");

  if (hasCriticalSecret || hasPrivateKey) {
    if (hasPrivateKey) reasons.push("Private key detected");
    if (hasCriticalSecret && !hasPrivateKey) reasons.push("Critical secret detected");
    return {
      action: "BLOCK",
      reasons,
      riskScore: calculateRisk(secretResult, piiResult),
      filesBlocked
    };
  }

  const riskScore = calculateRisk(secretResult, piiResult);
  const threshold = thresholdToNumber(policy.severity_threshold);

  const redactReasons: string[] = [];
  if (policy.rules.redact_emails && piiResult.pii.some((p) => p.type === "EMAIL")) {
    redactReasons.push("Email detected");
  }
  if (policy.rules.redact_phone && piiResult.pii.some((p) => p.type === "PHONE")) {
    redactReasons.push("Phone number detected");
  }
  if (policy.rules.redact_jwt && secretResult.secrets.some((s) => s.type === "JWT")) {
    redactReasons.push("JWT detected");
  }
  if (policy.rules.redact_generic_api_keys && secretResult.secrets.some((s) => s.type === "GENERIC_API_KEY")) {
    redactReasons.push("Generic API key detected");
  }
  if (riskScore >= threshold && (secretResult.hasSecrets || piiResult.hasPII)) {
    redactReasons.push(`Risk score exceeded threshold (${policy.severity_threshold})`);
  }

  if (redactReasons.length > 0) {
    return {
      action: "REDACT",
      reasons: redactReasons,
      riskScore,
      filesBlocked
    };
  }

  return {
    action: "ALLOW",
    reasons: [],
    riskScore,
    filesBlocked
  };
}
