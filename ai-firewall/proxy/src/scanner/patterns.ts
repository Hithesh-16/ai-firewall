import { PiiType, SecretType, Severity } from "../types";

export type SecretPattern = {
  type: SecretType;
  regex: RegExp;
  severity: Severity;
};

export type PiiPattern = {
  type: PiiType;
  regex: RegExp;
  severity: Severity;
};

export const secretPatterns: SecretPattern[] = [
  { type: "AWS_KEY", regex: /AKIA[0-9A-Z]{16}/g, severity: "critical" },
  { type: "PRIVATE_KEY", regex: /-----BEGIN (?:RSA|EC|DSA|PRIVATE) KEY-----/g, severity: "critical" },
  { type: "JWT", regex: /eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/g, severity: "high" },
  { type: "BEARER_TOKEN", regex: /Bearer\s[A-Za-z0-9\-_.]{20,}/g, severity: "high" },
  {
    type: "GENERIC_API_KEY",
    regex: /(api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{20,}/gi,
    severity: "high"
  },
  { type: "DATABASE_URL", regex: /(postgres|mysql|mongodb):\/\/[^\s]+/gi, severity: "critical" },
  { type: "GITHUB_TOKEN", regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g, severity: "critical" },
  { type: "SLACK_TOKEN", regex: /xox[baprs]-[A-Za-z0-9-]+/g, severity: "high" },
  { type: "GOOGLE_API_KEY", regex: /AIza[0-9A-Za-z\-_]{35}/g, severity: "high" },
  { type: "AZURE_KEY", regex: /[A-Za-z0-9+/]{86}==/g, severity: "critical" },
  {
    type: "HARDCODED_PASSWORD",
    regex: /(password|passwd|pwd)\s*[:=]\s*['"][^'"]{6,}['"]/gi,
    severity: "high"
  },
  {
    type: "ENV_VARIABLE",
    regex: /[A-Z_]{3,}=\S{8,}/g,
    severity: "medium"
  }
];

export const piiPatterns: PiiPattern[] = [
  { type: "EMAIL", regex: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, severity: "medium" },
  { type: "PHONE", regex: /\+?[0-9]{10,13}/g, severity: "medium" },
  { type: "AADHAAR", regex: /[2-9][0-9]{3}\s[0-9]{4}\s[0-9]{4}/g, severity: "high" },
  { type: "PAN", regex: /[A-Z]{5}[0-9]{4}[A-Z]/g, severity: "high" },
  { type: "SSN", regex: /\d{3}-\d{2}-\d{4}/g, severity: "high" },
  { type: "CREDIT_CARD", regex: /\b(?:\d[ -]*?){13,16}\b/g, severity: "high" },
  { type: "IP_ADDRESS", regex: /\b\d{1,3}(?:\.\d{1,3}){3}\b/g, severity: "medium" }
];
