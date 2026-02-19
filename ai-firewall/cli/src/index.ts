#!/usr/bin/env node

import path from "node:path";
import axios from "axios";

const PROXY_URL = process.env.AIFIREWALL_URL ?? "http://localhost:8080";

const HELP = `
AI Firewall CLI

Usage:
  aifirewall scan [dir]        Scan a directory for AI-leakable content
  aifirewall status            Check proxy server health
  aifirewall stats             Show request statistics
  aifirewall export [format]   Export audit logs (json|csv|compliance)
  aifirewall help              Show this help

Options:
  --url <url>    Proxy URL (default: http://localhost:8080)
  --token <tok>  API token for authenticated endpoints

Environment:
  AIFIREWALL_URL    Proxy URL
  AIFIREWALL_TOKEN  API token
`;

type Args = {
  command: string;
  positional: string;
  url: string;
  token: string;
};

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let url = PROXY_URL;
  let token = process.env.AIFIREWALL_TOKEN ?? "";
  let command = "help";
  let positional = "";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--url" && args[i + 1]) {
      url = args[++i];
    } else if (arg === "--token" && args[i + 1]) {
      token = args[++i];
    } else if (!command || command === "help") {
      command = arg;
    } else {
      positional = arg;
    }
  }

  if (args.length > 0 && !["scan", "status", "stats", "export", "help"].includes(args[0])) {
    command = "help";
  } else if (args.length > 0) {
    command = args[0];
    for (let i = 1; i < args.length; i++) {
      if (!args[i].startsWith("--")) {
        positional = args[i];
        break;
      }
    }
  }

  return { command, positional, url, token };
}

function headers(token: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

async function cmdStatus(url: string): Promise<void> {
  try {
    const res = await axios.get(`${url}/health`, { timeout: 5000 });
    console.log("✓ AI Firewall is running");
    console.log(`  URL:    ${url}`);
    console.log(`  Status: ${res.data.status}`);
  } catch {
    console.error("✗ AI Firewall is not reachable at", url);
    process.exit(1);
  }
}

async function cmdScan(url: string, dir: string): Promise<void> {
  const targetDir = path.resolve(dir || ".");
  console.log(`Scanning: ${targetDir}\n`);

  try {
    const res = await axios.post(
      `${url}/api/simulate`,
      { targetDir },
      { timeout: 120_000 }
    );

    const report = res.data;
    console.log(`=== AI Leak Simulation Report ===\n`);
    console.log(`Files analyzed:  ${report.filesAnalyzed}`);
    console.log(`Files excluded:  ${report.filesExcluded}`);
    console.log(`Overall risk:    ${report.overallRisk.toUpperCase()}\n`);

    if (report.findings.length > 0) {
      console.log("Findings:");
      for (const f of report.findings) {
        const loc = f.line ? `:${f.line}` : "";
        console.log(`  [${f.severity.toUpperCase()}] ${f.category} — ${f.detail}`);
        console.log(`          ${f.filePath}${loc}`);
      }
      console.log();
    }

    if (report.recommendations.length > 0) {
      console.log("Recommendations:");
      report.recommendations.forEach((r: string, i: number) => {
        console.log(`  ${i + 1}. ${r}`);
      });
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("Error:", err.response?.data ?? err.message);
    } else {
      console.error("Error:", err);
    }
    process.exit(1);
  }
}

async function cmdStats(url: string, token: string): Promise<void> {
  try {
    const res = await axios.get(`${url}/api/stats`, {
      headers: headers(token),
      timeout: 5000
    });
    const s = res.data;

    console.log("=== AI Firewall Stats ===\n");
    console.log(`Total requests:  ${s.totalRequests}`);
    console.log(`  Allowed:       ${s.allowed}`);
    console.log(`  Redacted:      ${s.redacted}`);
    console.log(`  Blocked:       ${s.blocked}`);
    console.log(`  Avg risk:      ${s.avgRiskScore}\n`);

    if (Object.keys(s.secretsByType).length > 0) {
      console.log("Top reasons:");
      const sorted = Object.entries(s.secretsByType)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 10);
      for (const [reason, count] of sorted) {
        console.log(`  ${count}x  ${reason}`);
      }
    }
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("Error:", err.response?.data ?? err.message);
    } else {
      console.error("Error:", err);
    }
    process.exit(1);
  }
}

async function cmdExport(url: string, token: string, format: string): Promise<void> {
  const fmt = format || "json";
  const validFormats = ["json", "csv", "compliance"];

  if (!validFormats.includes(fmt)) {
    console.error(`Invalid format: ${fmt}. Use: ${validFormats.join(", ")}`);
    process.exit(1);
  }

  try {
    const res = await axios.get(`${url}/api/export/${fmt}`, {
      headers: headers(token),
      timeout: 30_000
    });
    console.log(typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2));
  } catch (err) {
    if (axios.isAxiosError(err)) {
      console.error("Error:", err.response?.data ?? err.message);
    } else {
      console.error("Error:", err);
    }
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const { command, positional, url, token } = parseArgs(process.argv);

  switch (command) {
    case "status":
      await cmdStatus(url);
      break;
    case "scan":
      await cmdScan(url, positional);
      break;
    case "stats":
      await cmdStats(url, token);
      break;
    case "export":
      await cmdExport(url, token, positional);
      break;
    case "help":
    default:
      console.log(HELP);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
