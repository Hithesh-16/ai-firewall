import fs from "node:fs";
import path from "node:path";
import { PolicyConfig } from "../types";

const PROJECT_CONFIG_NAME = ".aifirewall.json";

type ProjectOverride = {
  extends?: "global";
  rules?: Partial<PolicyConfig["rules"]>;
  file_scope?: Partial<PolicyConfig["file_scope"]>;
  blocked_paths?: string[];
  severity_threshold?: PolicyConfig["severity_threshold"];
  smart_routing?: PolicyConfig["smart_routing"];
};

function findProjectConfig(startDir: string): string | null {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (current !== root) {
    const candidate = path.join(current, PROJECT_CONFIG_NAME);
    if (fs.existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }

  return null;
}

function loadProjectOverride(configPath: string): ProjectOverride | null {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw) as ProjectOverride;
  } catch {
    return null;
  }
}

export function mergeProjectPolicy(
  globalPolicy: PolicyConfig,
  projectRoot?: string
): PolicyConfig {
  const searchDir = projectRoot ?? process.cwd();
  const configPath = findProjectConfig(searchDir);
  if (!configPath) return globalPolicy;

  const override = loadProjectOverride(configPath);
  if (!override) return globalPolicy;

  const merged: PolicyConfig = {
    ...globalPolicy,
    rules: {
      ...globalPolicy.rules,
      ...(override.rules ?? {})
    },
    file_scope: {
      ...globalPolicy.file_scope,
      ...(override.file_scope ?? {}),
      blocklist: override.file_scope?.blocklist ?? globalPolicy.file_scope.blocklist,
      allowlist: override.file_scope?.allowlist ?? globalPolicy.file_scope.allowlist
    },
    blocked_paths: override.blocked_paths ?? globalPolicy.blocked_paths,
    severity_threshold: override.severity_threshold ?? globalPolicy.severity_threshold
  };

  if (override.smart_routing) {
    merged.smart_routing = {
      ...globalPolicy.smart_routing,
      ...override.smart_routing
    };
  }

  return merged;
}
