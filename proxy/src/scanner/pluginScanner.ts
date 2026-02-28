export interface PluginMetadata {
  name: string;
  publisher?: string;
  version?: string;
  permissions?: string[];
  activationEvents?: string[];
  contributes?: Record<string, unknown>;
  extensionKind?: string[];
  capabilities?: Record<string, unknown>;
}

export interface PluginRisk {
  name: string;
  publisher?: string;
  riskScore: number;
  flags: PluginFlag[];
}

export interface PluginFlag {
  category: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
}

const KNOWN_MALICIOUS_PUBLISHERS = [
  "unknown",
  "test-publisher",
];

const SUSPICIOUS_PERMISSIONS = new Map<string, { severity: "medium" | "high" | "critical"; description: string }>([
  ["fs", { severity: "high", description: "Full file system access" }],
  ["network", { severity: "high", description: "Network access" }],
  ["shell", { severity: "critical", description: "Shell/command execution" }],
  ["env", { severity: "high", description: "Environment variable access" }],
  ["clipboard", { severity: "medium", description: "Clipboard access" }],
  ["workspace", { severity: "medium", description: "Workspace trust required" }],
]);

const SUSPICIOUS_ACTIVATION = [
  { pattern: /\*/, description: "Activates on all events (wildcard)", severity: "high" as const },
  { pattern: /onStartupFinished/, description: "Activates immediately on startup", severity: "medium" as const },
  { pattern: /onUri/, description: "Activates on URI scheme (potential callback)", severity: "medium" as const },
];

export function scanPlugins(plugins: PluginMetadata[]): PluginRisk[] {
  return plugins.map(scanSinglePlugin);
}

function scanSinglePlugin(plugin: PluginMetadata): PluginRisk {
  const flags: PluginFlag[] = [];
  let score = 0;

  if (!plugin.publisher || KNOWN_MALICIOUS_PUBLISHERS.includes(plugin.publisher.toLowerCase())) {
    flags.push({
      category: "publisher",
      description: `Untrusted or unknown publisher: "${plugin.publisher ?? "none"}"`,
      severity: "high"
    });
    score += 30;
  }

  if (plugin.permissions) {
    for (const perm of plugin.permissions) {
      const suspicion = SUSPICIOUS_PERMISSIONS.get(perm.toLowerCase());
      if (suspicion) {
        flags.push({
          category: "permission",
          description: `${suspicion.description} (${perm})`,
          severity: suspicion.severity
        });
        score += suspicion.severity === "critical" ? 35 : suspicion.severity === "high" ? 25 : 15;
      }
    }
  }

  if (plugin.activationEvents) {
    for (const evt of plugin.activationEvents) {
      for (const sus of SUSPICIOUS_ACTIVATION) {
        if (sus.pattern.test(evt)) {
          flags.push({
            category: "activation",
            description: `${sus.description}: "${evt}"`,
            severity: sus.severity
          });
          score += sus.severity === "high" ? 20 : 10;
        }
      }
    }
  }

  if (plugin.capabilities) {
    const untrusted = (plugin.capabilities as any).untrustedWorkspaces;
    if (untrusted?.supported === true || untrusted?.supported === "limited") {
      flags.push({
        category: "capability",
        description: "Runs in untrusted workspaces",
        severity: "medium"
      });
      score += 10;
    }
  }

  return {
    name: plugin.name,
    publisher: plugin.publisher,
    riskScore: Math.min(100, score),
    flags
  };
}
