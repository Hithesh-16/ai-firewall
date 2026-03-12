import { loadPolicyConfig } from "../config";
import { evaluatePolicy } from "../policy/policyEngine";
import { redact } from "../redactor/redactor";
import { scanPII } from "../scanner/piiScanner";
import { scanSecrets } from "../scanner/secretScanner";
import { scanEntropy } from "../scanner/entropyScanner";
import { PolicyDecision } from "../types";

export type McpScanDecision = {
  action: "ALLOW" | "BLOCK" | "REDACT";
  riskScore: number;
  reasons: string[];
  sanitizedJson?: string;
};

/**
 * Scans a JSON string (typically arguments or result content from an MCP message)
 * by extracting its text, running the proxy's native secret/PII scanners,
 * and returning the policy decision and potentially sanitized JSON.
 */
export function scanMcpJson(jsonString: string): McpScanDecision {
  const policy = loadPolicyConfig();
  
  // 1. Scan for secrets and PII in the raw JSON text
  const secretResult = scanSecrets(jsonString);
  const piiResult = scanPII(jsonString);

  // Entropy-based detection
  const entropyMatches = scanEntropy(jsonString);
  if (entropyMatches.length > 0) {
    secretResult.secrets.push(...entropyMatches);
    secretResult.hasSecrets = secretResult.secrets.length > 0;
  }

  // 2. Evaluate Policy
  const decision: PolicyDecision = evaluatePolicy(secretResult, piiResult, policy, []);

  // 3. Return early if BLOCKED
  if (decision.action === "BLOCK") {
    return {
      action: "BLOCK",
      riskScore: decision.riskScore,
      reasons: decision.reasons
    };
  }

  // 4. Handle Redaction
  const shouldRedact = decision.action === "REDACT";
  const redactionInput = [
    ...secretResult.secrets.map((s) => ({ type: s.type, value: s.value })),
    ...piiResult.pii.map((p) => ({ type: p.type, value: p.value }))
  ];

  let sanitizedJson = jsonString;

  if (shouldRedact && redactionInput.length > 0) {
    sanitizedJson = redact(jsonString, redactionInput);
  }

  return {
    action: shouldRedact ? "REDACT" : "ALLOW",
    riskScore: decision.riskScore,
    reasons: decision.reasons,
    ...(shouldRedact && { sanitizedJson })
  };
}
