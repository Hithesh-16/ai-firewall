import * as vscode from "vscode";
import * as proxyClient from "../services/proxyClient";
import { updateAfterRequest } from "../statusBar";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "aiFirewall.chatView";

  private _view?: vscode.WebviewView;
  private _postToWebview(msg: unknown): void {
    this._view?.webview.postMessage(msg);
  }

  constructor(private readonly _extensionUri: vscode.Uri) {}

  public get postToWebview(): (msg: unknown) => void {
    return (msg: unknown) => this._postToWebview(msg);
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (msg) => {
      await this._handleMessage(msg);
    });
  }

  private async _handleMessage(msg: Record<string, unknown>): Promise<void> {
    switch (msg.type) {
      case "ready":
        await this._sendInitialData();
        break;

      case "estimate": {
        try {
          const result = await proxyClient.estimate(
            msg.model as string,
            msg.messages as proxyClient.ChatMessage[],
            msg.filePaths as string[] | undefined
          );
          this._postToWebview({ type: "estimateResult", data: result });
        } catch (err) {
          this._postToWebview({
            type: "error",
            message: err instanceof Error ? err.message : "Estimate failed"
          });
        }
        break;
      }

      case "chat": {
        try {
          const response = await proxyClient.chatCompletion(
            msg.model as string,
            msg.messages as proxyClient.ChatMessage[],
            msg.filePaths as string[] | undefined
          );
          this._postToWebview({ type: "chatResponse", data: response });

          if (response._firewall) {
            updateAfterRequest({
              action: response._firewall.action,
              model: response._firewall.model_used,
              tokensUsed: response._firewall.tokens_used,
              cost: response._firewall.cost_estimate
            });
          }
        } catch (err) {
          this._postToWebview({
            type: "chatError",
            message: err instanceof Error ? err.message : "Request failed"
          });
        }
        break;
      }

      case "loadProviders": {
        try {
          const providers = await proxyClient.listProviders();
          this._postToWebview({ type: "providers", data: providers });
        } catch {
          this._postToWebview({ type: "providers", data: [] });
        }
        break;
      }

      case "addProvider": {
        try {
          await proxyClient.addProvider(
            msg.name as string,
            msg.apiKey as string,
            msg.baseUrl as string
          );
          const providers = await proxyClient.listProviders();
          this._postToWebview({ type: "providers", data: providers });
          this._postToWebview({
            type: "toast",
            message: `Provider "${msg.name}" added successfully`
          });
        } catch (err) {
          this._postToWebview({
            type: "error",
            message: err instanceof Error ? err.message : "Failed to add provider"
          });
        }
        break;
      }

      case "deleteProvider": {
        try {
          await proxyClient.deleteProviderById(msg.id as number);
          const providers = await proxyClient.listProviders();
          this._postToWebview({ type: "providers", data: providers });
        } catch (err) {
          this._postToWebview({
            type: "error",
            message: err instanceof Error ? err.message : "Failed to delete provider"
          });
        }
        break;
      }

      case "toggleProvider": {
        try {
          await proxyClient.toggleProvider(
            msg.id as number,
            msg.enabled as boolean
          );
          const providers = await proxyClient.listProviders();
          this._postToWebview({ type: "providers", data: providers });
        } catch (err) {
          this._postToWebview({
            type: "error",
            message: err instanceof Error ? err.message : "Failed to toggle provider"
          });
        }
        break;
      }

      case "loadModels": {
        try {
          const models = await proxyClient.listModels();
          this._postToWebview({ type: "models", data: models });
        } catch {
          this._postToWebview({ type: "models", data: [] });
        }
        break;
      }

      case "addModel": {
        try {
          await proxyClient.addModel(
            msg.providerId as number,
            msg.modelName as string,
            {
              displayName: msg.displayName as string | undefined,
              inputCostPer1k: msg.inputCostPer1k as number | undefined,
              outputCostPer1k: msg.outputCostPer1k as number | undefined
            }
          );
          const models = await proxyClient.listModels();
          this._postToWebview({ type: "models", data: models });
          this._postToWebview({
            type: "toast",
            message: `Model "${msg.modelName}" added`
          });
        } catch (err) {
          this._postToWebview({
            type: "error",
            message: err instanceof Error ? err.message : "Failed to add model"
          });
        }
        break;
      }

      case "loadCredits": {
        try {
          const credits = await proxyClient.listCredits();
          this._postToWebview({ type: "credits", data: credits });
        } catch {
          this._postToWebview({ type: "credits", data: [] });
        }
        break;
      }

      case "loadUsage": {
        try {
          const usage = await proxyClient.getUsageSummary();
          this._postToWebview({ type: "usage", data: usage });
        } catch {
          this._postToWebview({
            type: "usage",
            data: { totalRequests: 0, totalTokens: 0, totalCost: 0, byModel: [] }
          });
        }
        break;
      }

      case "getConfig": {
        const config = vscode.workspace.getConfiguration("aiFirewall");
        this._postToWebview({
          type: "config",
          data: {
            proxyUrl: config.get<string>("proxyUrl"),
            defaultModel: config.get<string>("defaultModel"),
            showPreFlight: config.get<boolean>("showPreFlight"),
            autoRedact: config.get<boolean>("autoRedact")
          }
        });
        break;
      }

      case "insertCode": {
        await vscode.commands.executeCommand(
          "aiFirewall.insertCode",
          msg.code as string
        );
        break;
      }

      case "replaceSelection": {
        await vscode.commands.executeCommand(
          "aiFirewall.replaceSelection",
          msg.code as string
        );
        break;
      }

      case "copyCode": {
        await vscode.commands.executeCommand(
          "aiFirewall.copyCode",
          msg.code as string
        );
        break;
      }
    }
  }

  private async _sendInitialData(): Promise<void> {
    const config = vscode.workspace.getConfiguration("aiFirewall");
    this._postToWebview({
      type: "config",
      data: {
        proxyUrl: config.get<string>("proxyUrl"),
        defaultModel: config.get<string>("defaultModel"),
        showPreFlight: config.get<boolean>("showPreFlight"),
        autoRedact: config.get<boolean>("autoRedact")
      }
    });

    const healthy = await proxyClient.checkHealth();
    this._postToWebview({ type: "connectionStatus", connected: healthy });

    if (healthy) {
      try {
        const [providers, models, credits] = await Promise.all([
          proxyClient.listProviders(),
          proxyClient.listModels(),
          proxyClient.listCredits()
        ]);
        this._postToWebview({ type: "providers", data: providers });
        this._postToWebview({ type: "models", data: models });
        this._postToWebview({ type: "credits", data: credits });
      } catch {
        // proxy reachable but auth might be required
      }
    }
  }

  private _getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, "dist", "webview.js")
    );

    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';" />
  <title>AI Firewall</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-panel-border);
      --input-bg: var(--vscode-input-background);
      --input-fg: var(--vscode-input-foreground);
      --input-border: var(--vscode-input-border);
      --btn-bg: var(--vscode-button-background);
      --btn-fg: var(--vscode-button-foreground);
      --btn-hover: var(--vscode-button-hoverBackground);
      --btn-secondary-bg: var(--vscode-button-secondaryBackground);
      --btn-secondary-fg: var(--vscode-button-secondaryForeground);
      --badge-bg: var(--vscode-badge-background);
      --badge-fg: var(--vscode-badge-foreground);
      --error: var(--vscode-errorForeground);
      --warning: var(--vscode-editorWarning-foreground);
      --success: var(--vscode-testing-iconPassed);
      --link: var(--vscode-textLink-foreground);
      --subtle: var(--vscode-descriptionForeground);
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--fg); background: var(--bg); overflow-x: hidden; }

    #app { display: flex; flex-direction: column; height: 100vh; }

    .tabs { display: flex; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .tab { flex: 1; padding: 8px 4px; text-align: center; cursor: pointer; border: none; background: none; color: var(--subtle); font-size: 11px; font-family: inherit; transition: color 0.15s, border-color 0.15s; border-bottom: 2px solid transparent; }
    .tab:hover { color: var(--fg); }
    .tab.active { color: var(--fg); border-bottom-color: var(--btn-bg); }

    .panel { flex: 1; overflow-y: auto; padding: 12px; display: none; flex-direction: column; }
    .panel.active { display: flex; }

    .chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-bottom: 8px; }
    .msg { padding: 8px 10px; border-radius: 6px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; font-size: 12.5px; }
    .msg.user { background: var(--input-bg); align-self: flex-end; max-width: 90%; }
    .msg.assistant { background: var(--btn-secondary-bg); color: var(--btn-secondary-fg); align-self: flex-start; max-width: 95%; }
    .msg.system { background: none; color: var(--subtle); font-style: italic; font-size: 11px; align-self: center; text-align: center; }

    .chat-input-row { display: flex; gap: 6px; flex-shrink: 0; padding-top: 8px; border-top: 1px solid var(--border); }
    .chat-input { flex: 1; padding: 8px; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--input-border); border-radius: 4px; font-family: inherit; font-size: 12.5px; resize: none; min-height: 36px; max-height: 120px; }
    .chat-input:focus { outline: 1px solid var(--btn-bg); }

    button { cursor: pointer; font-family: inherit; }
    .btn { padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; }
    .btn-primary { background: var(--btn-bg); color: var(--btn-fg); }
    .btn-primary:hover { background: var(--btn-hover); }
    .btn-secondary { background: var(--btn-secondary-bg); color: var(--btn-secondary-fg); }
    .btn-danger { background: var(--error); color: #fff; }
    .btn-sm { padding: 3px 8px; font-size: 11px; }

    .model-selector { display: flex; gap: 6px; align-items: center; flex-shrink: 0; padding-bottom: 8px; }
    .model-selector select { flex: 1; padding: 4px 6px; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--input-border); border-radius: 4px; font-family: inherit; font-size: 12px; }

    .preflight-card { background: var(--input-bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px; margin-bottom: 8px; font-size: 12px; flex-shrink: 0; }
    .preflight-card .pf-row { display: flex; justify-content: space-between; padding: 3px 0; }
    .preflight-card .pf-label { color: var(--subtle); }
    .preflight-card .pf-actions { display: flex; gap: 6px; margin-top: 8px; }
    .pf-badge { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 10px; font-weight: 600; }
    .pf-badge.allow { background: #22c55e22; color: var(--success); }
    .pf-badge.redact { background: #eab30822; color: var(--warning); }
    .pf-badge.block { background: #ef444422; color: var(--error); }

    input[type="text"], input[type="url"], input[type="password"], input[type="number"] {
      width: 100%; padding: 6px 8px; background: var(--input-bg); color: var(--input-fg);
      border: 1px solid var(--input-border); border-radius: 4px; font-family: inherit; font-size: 12px; margin-top: 4px;
    }
    input:focus { outline: 1px solid var(--btn-bg); }

    .form-group { margin-bottom: 10px; }
    .form-group label { font-size: 11px; color: var(--subtle); display: block; }

    .card { background: var(--input-bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px; margin-bottom: 8px; }
    .card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .card-title { font-weight: 600; font-size: 12px; }

    .progress-bar { height: 6px; background: var(--border); border-radius: 3px; overflow: hidden; margin-top: 4px; }
    .progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }

    .empty-state { text-align: center; color: var(--subtle); padding: 24px 12px; font-size: 12px; }

    .toast { position: fixed; bottom: 12px; left: 12px; right: 12px; padding: 8px 12px; background: var(--badge-bg); color: var(--badge-fg); border-radius: 6px; font-size: 11px; z-index: 100; text-align: center; animation: fadeOut 3s forwards; }
    @keyframes fadeOut { 0%,80% { opacity: 1; } 100% { opacity: 0; } }

    .connection-bar { padding: 6px 12px; text-align: center; font-size: 11px; flex-shrink: 0; }
    .connection-bar.ok { background: #22c55e18; color: var(--success); }
    .connection-bar.err { background: #ef444418; color: var(--error); }

    .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: var(--subtle); margin-bottom: 8px; margin-top: 12px; }
    .section-title:first-child { margin-top: 0; }

    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .stat-card { background: var(--input-bg); border: 1px solid var(--border); border-radius: 6px; padding: 10px; text-align: center; }
    .stat-value { font-size: 18px; font-weight: 700; }
    .stat-label { font-size: 10px; color: var(--subtle); margin-top: 2px; }

    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--btn-bg); border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .code-block-wrapper { margin: 8px 0; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
    .code-block-header { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; background: var(--input-bg); border-bottom: 1px solid var(--border); }
    .code-block-lang { font-size: 10px; color: var(--subtle); text-transform: uppercase; letter-spacing: 0.5px; }
    .code-block-actions { display: flex; gap: 4px; }
    .code-block-pre { margin: 0; padding: 8px; overflow-x: auto; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; line-height: 1.4; background: var(--bg); }
    .code-block-pre code { white-space: pre; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
