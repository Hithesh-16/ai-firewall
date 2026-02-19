import * as vscode from "vscode";

export function registerCommands(
  context: vscode.ExtensionContext,
  postToWebview: (msg: unknown) => void
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("aiFirewall.openChat", () => {
      vscode.commands.executeCommand("aiFirewall.chatView.focus");
    }),

    vscode.commands.registerCommand("aiFirewall.addProvider", () => {
      postToWebview({ type: "navigate", tab: "providers" });
      vscode.commands.executeCommand("aiFirewall.chatView.focus");
    }),

    vscode.commands.registerCommand("aiFirewall.selectModel", () => {
      postToWebview({ type: "navigate", tab: "models" });
      vscode.commands.executeCommand("aiFirewall.chatView.focus");
    }),

    vscode.commands.registerCommand("aiFirewall.showCreditStatus", () => {
      postToWebview({ type: "navigate", tab: "credits" });
      vscode.commands.executeCommand("aiFirewall.chatView.focus");
    }),

    vscode.commands.registerCommand("aiFirewall.explainCode", () => {
      sendSelectionPrompt(postToWebview, "Explain the following code in detail:");
    }),

    vscode.commands.registerCommand("aiFirewall.refactorCode", () => {
      sendSelectionPrompt(
        postToWebview,
        "Refactor the following code to be cleaner, more readable, and follow best practices:"
      );
    }),

    vscode.commands.registerCommand("aiFirewall.documentCode", () => {
      sendSelectionPrompt(
        postToWebview,
        "Add clear, concise documentation comments to the following code:"
      );
    }),

    vscode.commands.registerCommand("aiFirewall.fixCode", () => {
      sendSelectionPrompt(
        postToWebview,
        "Fix any bugs, errors, or issues in the following code. Return the corrected version:"
      );
    }),

    vscode.commands.registerCommand("aiFirewall.generateTests", () => {
      sendSelectionPrompt(
        postToWebview,
        "Generate comprehensive unit tests for the following code:"
      );
    }),

    vscode.commands.registerCommand("aiFirewall.toggleInlineCompletions", () => {
      const config = vscode.workspace.getConfiguration("aiFirewall");
      const current = config.get<boolean>("inlineCompletions", true);
      config.update("inlineCompletions", !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `AI Firewall: Inline completions ${!current ? "enabled" : "disabled"}`
      );
    }),

    vscode.commands.registerCommand("aiFirewall.insertCode", (code: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.env.clipboard.writeText(code);
        vscode.window.showInformationMessage("Code copied to clipboard (no active editor).");
        return;
      }

      editor.edit((editBuilder) => {
        if (editor.selection.isEmpty) {
          editBuilder.insert(editor.selection.active, code);
        } else {
          editBuilder.replace(editor.selection, code);
        }
      });
    }),

    vscode.commands.registerCommand("aiFirewall.replaceSelection", (code: string) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.env.clipboard.writeText(code);
        vscode.window.showInformationMessage("Code copied to clipboard.");
        return;
      }
      editor.edit((editBuilder) => {
        editBuilder.replace(editor.selection, code);
      });
    }),

    vscode.commands.registerCommand("aiFirewall.copyCode", (code: string) => {
      vscode.env.clipboard.writeText(code);
      vscode.window.showInformationMessage("Code copied to clipboard.");
    }),

    vscode.commands.registerCommand("aiFirewall.viewDashboard", () => {
      const config = vscode.workspace.getConfiguration("aiFirewall");
      const proxyUrl = config.get<string>("proxyUrl", "http://localhost:8080");
      const dashUrl = proxyUrl.replace(/:\d+$/, ":3000");
      vscode.env.openExternal(vscode.Uri.parse(dashUrl));
    }),

    vscode.commands.registerCommand("aiFirewall.viewLogs", () => {
      const config = vscode.workspace.getConfiguration("aiFirewall");
      const proxyUrl = config.get<string>("proxyUrl", "http://localhost:8080");
      const dashUrl = proxyUrl.replace(/:\d+$/, ":3000/logs");
      vscode.env.openExternal(vscode.Uri.parse(dashUrl));
    }),

    vscode.commands.registerCommand("aiFirewall.toggleScanning", () => {
      const config = vscode.workspace.getConfiguration("aiFirewall");
      const current = config.get<boolean>("autoRedact", true);
      config.update("autoRedact", !current, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(
        `AI Firewall: Scanning ${!current ? "enabled" : "disabled"}`
      );
    }),

    vscode.commands.registerCommand("aiFirewall.showRiskScore", async () => {
      const config = vscode.workspace.getConfiguration("aiFirewall");
      const proxyUrl = config.get<string>("proxyUrl", "http://localhost:8080");
      try {
        const res = await fetch(`${proxyUrl}/api/risk-score`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { riskScore: number };
        const level =
          data.riskScore >= 70 ? "HIGH" : data.riskScore >= 30 ? "MEDIUM" : "LOW";
        vscode.window.showInformationMessage(
          `AI Firewall Risk Score: ${data.riskScore}/100 (${level})`
        );
      } catch {
        vscode.window.showWarningMessage(
          "Could not fetch risk score — is the proxy running?"
        );
      }
    })
  );
}

function sendSelectionPrompt(
  postToWebview: (msg: unknown) => void,
  instruction: string
): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active editor with selected text.");
    return;
  }

  const selection = editor.document.getText(editor.selection);
  if (!selection) {
    vscode.window.showWarningMessage("Select some code first.");
    return;
  }

  const lang = editor.document.languageId;
  const filePath = editor.document.uri.fsPath;
  const prompt = `${instruction}\n\nFile: ${filePath}\nLanguage: ${lang}\n\n\`\`\`${lang}\n${selection}\n\`\`\``;

  vscode.commands.executeCommand("aiFirewall.chatView.focus");
  postToWebview({
    type: "injectPrompt",
    prompt,
    filePaths: [filePath]
  });
}
