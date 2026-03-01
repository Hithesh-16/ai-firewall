import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { scanSecrets } from "../scanner/secretScanner";
import { scanPII } from "../scanner/piiScanner";
import { checkFileScope } from "../scope/fileScope";
import { FileScopeConfig, LeakFinding, LeakSimulationReport, Severity } from "../types";

type InferencePattern = {
  regex: RegExp;
  category: string;
  detail: string;
  severity: Severity;
};

const inferencePatterns: InferencePattern[] = [
  {
    regex: /CREATE\s+TABLE\s+(\w+)/gi,
    category: "Database Schema",
    detail: "SQL table definition detected",
    severity: "critical"
  },
  {
    regex: /(stripe|paypal|razorpay|braintree)/gi,
    category: "Payment Gateway",
    detail: "Payment provider integration detected",
    severity: "critical"
  },
  {
    regex: /(jwt|jsonwebtoken|refresh.?token|access.?token)/gi,
    category: "Authentication Flow",
    detail: "Authentication mechanism detected",
    severity: "high"
  },
  {
    regex: /(app\.(get|post|put|delete|patch)\s*\(|router\.(get|post|put|delete|patch))/gi,
    category: "API Endpoints",
    detail: "Route/endpoint definition detected",
    severity: "high"
  },
  {
    regex: /(pricing|discount|commission|margin|markup)\s*[=:]/gi,
    category: "Business Logic",
    detail: "Pricing or financial logic detected",
    severity: "medium"
  },
  {
    regex: /(aws|gcp|azure|us-east|eu-west|ap-south|ecs|eks|lambda|s3)/gi,
    category: "Infrastructure",
    detail: "Cloud infrastructure reference detected",
    severity: "medium"
  },
  {
    regex: /(process\.env\.\w+)/g,
    category: "Environment Variables",
    detail: "Environment variable reference detected",
    severity: "high"
  },
  {
    regex: /(SELECT|INSERT|UPDATE|DELETE)\s.+FROM\s/gi,
    category: "Database Queries",
    detail: "Raw SQL query detected",
    severity: "high"
  }
];

const DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/*.min.js",
  "**/package-lock.json",
  "**/yarn.lock"
];

function walkDir(dir: string, ignorePatterns: string[]): string[] {
  const files: string[] = [];
  const isIgnored = (p: string) => ignorePatterns.some((pattern) => picomatch(pattern, { dot: true })(p));

  function recurse(current: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const relative = path.relative(dir, full).replace(/\\/g, "/");

      if (isIgnored(relative)) continue;

      if (entry.isDirectory()) {
        recurse(full);
      } else if (entry.isFile()) {
        files.push(full);
      }
    }
  }

  recurse(dir);
  return files;
}

function isTextFile(filePath: string): boolean {
  const textExtensions = new Set([
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
    ".py", ".rb", ".go", ".rs", ".java", ".kt", ".swift", ".cs",
    ".json", ".yaml", ".yml", ".toml", ".xml", ".csv",
    ".sql", ".graphql", ".gql",
    ".sh", ".bash", ".zsh", ".fish",
    ".env", ".cfg", ".conf", ".ini", ".properties",
    ".md", ".txt", ".html", ".css", ".scss", ".less",
    ".dockerfile", ".tf", ".hcl"
  ]);
  const ext = path.extname(filePath).toLowerCase();
  return textExtensions.has(ext) || ext === "";
}

function analyzeFile(
  filePath: string,
  content: string,
  rootDir: string
): LeakFinding[] {
  const findings: LeakFinding[] = [];
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, "/");

  const secretResult = scanSecrets(content);
  for (const secret of secretResult.secrets) {
    const lineNum = content.substring(0, secret.position).split("\n").length;
    findings.push({
      severity: secret.severity,
      category: `Secret: ${secret.type}`,
      detail: `${secret.type} detected (value redacted)`,
      filePath: relativePath,
      line: lineNum
    });
  }

  const piiResult = scanPII(content);
  for (const pii of piiResult.pii) {
    const lineNum = content.substring(0, pii.position).split("\n").length;
    findings.push({
      severity: pii.severity,
      category: `PII: ${pii.type}`,
      detail: `${pii.type} detected`,
      filePath: relativePath,
      line: lineNum
    });
  }

  for (const pattern of inferencePatterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match = regex.exec(content);
    while (match !== null) {
      const lineNum = content.substring(0, match.index).split("\n").length;
      findings.push({
        severity: pattern.severity,
        category: pattern.category,
        detail: pattern.detail,
        filePath: relativePath,
        line: lineNum
      });
      match = regex.exec(content);
    }
  }

  return findings;
}

function deduplicateFindings(findings: LeakFinding[]): LeakFinding[] {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.category}:${f.filePath}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function determineOverallRisk(findings: LeakFinding[]): LeakSimulationReport["overallRisk"] {
  if (findings.some((f) => f.severity === "critical")) return "critical";
  if (findings.some((f) => f.severity === "high")) return "high";
  if (findings.some((f) => f.severity === "medium")) return "medium";
  return "low";
}

function generateRecommendations(findings: LeakFinding[]): string[] {
  const recommendations: string[] = [];
  const categories = new Set(findings.map((f) => f.category));
  const dirs = new Set(findings.filter((f) => f.severity === "critical").map((f) => {
    const parts = f.filePath.split("/");
    return parts.length > 1 ? parts.slice(0, -1).join("/") : f.filePath;
  }));

  for (const dir of dirs) {
    recommendations.push(`Add /${dir}/ to blocked_paths in policy.json`);
  }

  if (categories.has("Database Schema") || categories.has("Database Queries")) {
    recommendations.push("Enable automatic redaction for all DB connection strings");
  }
  if (categories.has("Authentication Flow")) {
    recommendations.push("Enable local LLM routing for files in authentication directories");
  }
  if (categories.has("Payment Gateway")) {
    recommendations.push("Add payment directories to file_scope blocklist");
  }
  if (categories.has("Environment Variables")) {
    recommendations.push("Ensure .env files are in file_scope blocklist");
  }

  if (recommendations.length === 0) {
    recommendations.push("No critical issues found. Current policy appears adequate.");
  }

  return recommendations;
}

export function runLeakSimulation(
  targetDir: string,
  fileScopeConfig: FileScopeConfig,
  maxFileSizeKb = 500
): LeakSimulationReport {
  const allFiles = walkDir(targetDir, DEFAULT_IGNORE);

  let filesAnalyzed = 0;
  let filesExcluded = 0;
  const allFindings: LeakFinding[] = [];

  for (const filePath of allFiles) {
    if (!isTextFile(filePath)) continue;

    const scopeResult = checkFileScope(filePath, fileScopeConfig);
    if (!scopeResult.allowed) {
      filesExcluded++;
      continue;
    }

    try {
      const stat = fs.statSync(filePath);
      if (stat.size > maxFileSizeKb * 1024) continue;

      const content = fs.readFileSync(filePath, "utf-8");
      const findings = analyzeFile(filePath, content, targetDir);
      allFindings.push(...findings);
      filesAnalyzed++;
    } catch {
      continue;
    }
  }

  const deduplicated = deduplicateFindings(allFindings);
  const sorted = deduplicated.sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2 };
    return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
  });

  return {
    timestamp: Date.now(),
    filesAnalyzed,
    filesExcluded,
    overallRisk: determineOverallRisk(sorted),
    findings: sorted,
    recommendations: generateRecommendations(sorted)
  };
}
