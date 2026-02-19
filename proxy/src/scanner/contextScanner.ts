import { Severity } from "../types";

export type ContextAdjustment = {
  matchType: string;
  originalSeverity: Severity;
  adjustedSeverity: Severity;
  reason: string;
};

const TEST_PATH_PATTERNS = [
  /test[s]?\//i,
  /__tests__\//i,
  /\.test\.\w+$/i,
  /\.spec\.\w+$/i,
  /fixture[s]?\//i,
  /mock[s]?\//i,
  /example[s]?\//i,
  /sample[s]?\//i,
  /demo\//i
];

const SENSITIVE_PATH_PATTERNS = [
  /src\/(?:auth|payment|billing|security)\//i,
  /config\//i,
  /\.env/i,
  /secrets?\//i,
  /credentials?\//i,
  /production/i,
  /deploy/i
];

const PLACEHOLDER_VALUES = [
  "test123", "password", "secret", "changeme", "example",
  "placeholder", "dummy", "sample", "foobar", "abc123",
  "your_key_here", "xxx", "todo", "fixme", "replace_me"
];

export function adjustSeverity(
  matchValue: string,
  matchType: string,
  severity: Severity,
  filePaths?: string[]
): ContextAdjustment | null {
  const lowerValue = matchValue.toLowerCase();
  const isPlaceholder = PLACEHOLDER_VALUES.some((p) => lowerValue.includes(p));

  if (isPlaceholder) {
    return {
      matchType,
      originalSeverity: severity,
      adjustedSeverity: downgrade(severity),
      reason: "Appears to be a placeholder/test value"
    };
  }

  if (filePaths && filePaths.length > 0) {
    const isTestFile = filePaths.some((fp) =>
      TEST_PATH_PATTERNS.some((pat) => pat.test(fp))
    );

    if (isTestFile) {
      return {
        matchType,
        originalSeverity: severity,
        adjustedSeverity: downgrade(severity),
        reason: "Detected in test/fixture file"
      };
    }

    const isSensitivePath = filePaths.some((fp) =>
      SENSITIVE_PATH_PATTERNS.some((pat) => pat.test(fp))
    );

    if (isSensitivePath && severity !== "critical") {
      return {
        matchType,
        originalSeverity: severity,
        adjustedSeverity: upgrade(severity),
        reason: "Detected in sensitive path (auth/payment/config)"
      };
    }
  }

  return null;
}

function downgrade(sev: Severity): Severity {
  switch (sev) {
    case "critical": return "high";
    case "high": return "medium";
    case "medium": return "medium";
  }
}

function upgrade(sev: Severity): Severity {
  switch (sev) {
    case "medium": return "high";
    case "high": return "critical";
    case "critical": return "critical";
  }
}
