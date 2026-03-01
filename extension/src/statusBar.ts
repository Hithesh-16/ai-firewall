import * as vscode from "vscode";
import { checkHealth } from "./services/proxyClient";

let item: vscode.StatusBarItem;
let healthInterval: ReturnType<typeof setInterval> | undefined;

export function createStatusBar(): vscode.StatusBarItem {
  item = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  item.command = "aiFirewall.openChat";
  setConnecting();
  item.show();

  refreshHealth();
  healthInterval = setInterval(refreshHealth, 30_000);

  return item;
}

async function refreshHealth(): Promise<void> {
  const ok = await checkHealth();
  if (ok) {
    setConnected();
  } else {
    setDisconnected();
  }
}

function setConnecting(): void {
  item.text = "$(shield) AI Firewall: connecting...";
  item.backgroundColor = undefined;
  item.tooltip = "Checking proxy connection";
}

function setConnected(): void {
  item.text = "$(shield) AI Firewall";
  item.backgroundColor = undefined;
  item.tooltip = "AI Firewall proxy is running — click to open chat";
}

function setDisconnected(): void {
  item.text = "$(shield) AI Firewall: offline";
  item.backgroundColor = new vscode.ThemeColor(
    "statusBarItem.errorBackground"
  );
  item.tooltip = "Cannot reach proxy at localhost:8080 — is the server running?";
}

export function updateAfterRequest(meta: {
  action: string;
  model: string;
  tokensUsed?: number;
  cost?: number;
}): void {
  if (!item) {
    return;
  }

  const tokenStr =
    meta.tokensUsed !== undefined
      ? ` | ${(meta.tokensUsed / 1000).toFixed(1)}k tok`
      : "";
  const costStr =
    meta.cost !== undefined ? ` | $${meta.cost.toFixed(4)}` : "";

  item.text = `$(shield) ${meta.model}${tokenStr}${costStr}`;

  if (meta.action === "BLOCK") {
    item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground"
    );
  } else if (meta.action === "REDACT") {
    item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground"
    );
  } else {
    item.backgroundColor = undefined;
  }
}

export function disposeStatusBar(): void {
  if (healthInterval) {
    clearInterval(healthInterval);
  }
  item?.dispose();
}
