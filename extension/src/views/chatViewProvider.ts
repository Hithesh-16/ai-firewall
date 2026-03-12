import * as path from "path";
import * as vscode from "vscode";
import { exec } from "child_process";
import { promisify } from "util";
import { FileIndexer, isBinaryPath } from "../services/fileIndexer";
import * as proxyClient from "../services/proxyClient";
import { updateAfterRequest } from "../statusBar";

const execAsync = promisify(exec);

const LOG_CHANNEL_NAME = "AI Firewall";

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "aiFirewall.chatView";

  private _view?: vscode.WebviewView;
  private _log = vscode.window.createOutputChannel(LOG_CHANNEL_NAME);
  private _fileScopeCache: proxyClient.FileScopeConfig | null = null;


  private _postToWebview(msg: unknown): void {
    this._view?.webview.postMessage(msg);
  }

  private _logPayload(label: string, obj: unknown): void {
    try {
      const str = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
      const truncated = str.length > 2000 ? str.slice(0, 2000) + "\n... [truncated]" : str;
      this._log.appendLine(`[${label}]\n${truncated}`);
    } catch {
      this._log.appendLine(`[${label}] (could not serialize)`);
    }
  }

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _fileIndexer: FileIndexer
  ) {}

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
    const msgType = String(msg.type ?? "(unknown)");
    this._log.appendLine(`[Webview → Extension] type=${msgType}`);

    switch (msg.type) {
      case "ready":
        this._log.appendLine("  → Sending initial data (config, connection, providers, models, credits, usage)");
        await this._sendInitialData();
        break;

      case "login": {
        try {
          const email = String(msg.email ?? "");
          const password = String(msg.password ?? "");
          const res = await proxyClient.login(email, password);
          await vscode.workspace.getConfiguration("aiFirewall").update("apiToken", res.token, vscode.ConfigurationTarget.Global);
          this._postToWebview({ type: "authStatus", authed: true, user: res.user });
          await this._sendInitialData();
        } catch (err) {
          this._postToWebview({ type: "authStatus", authed: false });
          this._postToWebview({ type: "error", message: err instanceof Error ? err.message : "Login failed" });
        }
        break;
      }

      case "register": {
        try {
          const email = String(msg.email ?? "");
          const name = String(msg.name ?? "");
          const password = String(msg.password ?? "");
          const res = await proxyClient.register(email, name, password);
          await vscode.workspace.getConfiguration("aiFirewall").update("apiToken", res.token, vscode.ConfigurationTarget.Global);
          this._postToWebview({ type: "authStatus", authed: true, user: res.user });
          await this._sendInitialData();
        } catch (err) {
          this._postToWebview({ type: "authStatus", authed: false });
          this._postToWebview({ type: "error", message: err instanceof Error ? err.message : "Register failed" });
        }
        break;
      }

      case "logout": {
        await vscode.workspace.getConfiguration("aiFirewall").update("apiToken", "", vscode.ConfigurationTarget.Global);
        this._fileScopeCache = null;
        this._postToWebview({ type: "authStatus", authed: false });
        break;
      }

      case "configureRestrictions": {
        await this._configureRestrictions();
        break;
      }

      case "attachFiles": {
        const picked = await vscode.window.showOpenDialog({
          canSelectMany: true,
          canSelectFiles: true,
          canSelectFolders: true,
          openLabel: "Attach to chat"
        });
        if (!picked || picked.length === 0) break;

        if (!this._fileScopeCache) {
          try {
            const res = await proxyClient.getFileScope();
            this._fileScopeCache = res.file_scope;
          } catch {
            this._fileScopeCache = {
              mode: "blocklist",
              blocklist: ["**/node_modules/**", "**/dist/**", "**/.git/**", ".env", ".env.*"],
              allowlist: [],
              max_file_size_kb: 500,
              scan_on_open: false,
              scan_on_send: true
            };
          }
        }
        const scope = this._fileScopeCache;
        const safeFiles: string[] = [];
        const restrictedFiles: string[] = [];

        for (const uri of picked) {
          const rel = this._toRelativePath(uri.fsPath);
          if (scope && this._isRestricted(rel, scope)) {
            restrictedFiles.push(rel);
          } else {
            safeFiles.push(rel);
          }
        }

        let bypassedFiles: string[] = [];
        if (restrictedFiles.length > 0) {
          const preview = restrictedFiles.slice(0, 3).join(", ") + (restrictedFiles.length > 3 ? "…" : "");
          const choice = await vscode.window.showWarningMessage(
            `${restrictedFiles.length} restricted file(s) selected: ${preview}. Include anyway?`,
            { modal: true },
            "Allow",
            "Exclude"
          );
          if (choice === "Allow") {
            bypassedFiles = restrictedFiles;
          }
        }

        // Read image files as base64 data URLs so the webview can preview them
        const root = this._getCurrentRepoRoot();
        const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"]);
        const imageFiles: { name: string; dataUrl: string }[] = [];
        const nonImageSafe: string[] = [];

        for (const rel of safeFiles) {
          const ext = rel.split(".").pop()?.toLowerCase() ?? "";
          if (IMAGE_EXTS.has("." + ext)) {
            try {
              const abs = path.isAbsolute(rel) ? rel : path.join(root ?? "", rel);
              const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
              const b64 = Buffer.from(bytes).toString("base64");
              const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
              imageFiles.push({ name: rel, dataUrl: `data:${mime};base64,${b64}` });
            } catch {
              nonImageSafe.push(rel);
            }
          } else {
            nonImageSafe.push(rel);
          }
        }
        // Also check bypassed files for images
        const nonImageBypassed: string[] = [];
        const bypassedImgFiles: { name: string; dataUrl: string }[] = [];
        for (const rel of bypassedFiles) {
          const ext = rel.split(".").pop()?.toLowerCase() ?? "";
          if (IMAGE_EXTS.has("." + ext)) {
            try {
              const abs = path.isAbsolute(rel) ? rel : path.join(root ?? "", rel);
              const bytes = await vscode.workspace.fs.readFile(vscode.Uri.file(abs));
              const b64 = Buffer.from(bytes).toString("base64");
              const mime = `image/${ext === "jpg" ? "jpeg" : ext}`;
              bypassedImgFiles.push({ name: rel, dataUrl: `data:${mime};base64,${b64}` });
            } catch {
              nonImageBypassed.push(rel);
            }
          } else {
            nonImageBypassed.push(rel);
          }
        }

        this._postToWebview({
          type: "attachedFiles",
          safeFiles: nonImageSafe,
          bypassedFiles: nonImageBypassed,
          imageFiles: [...imageFiles, ...bypassedImgFiles]
        });
        break;
      }

      case "estimate": {
        const model = msg.model as string;
        const messages = (msg.messages as proxyClient.ChatMessage[]) ?? [];
        const bypassedFilePaths = (msg.bypassedFilePaths as string[] | undefined) ?? [];
        // Read current repository and apply user's restrictions (from proxy file scope)
        const workspaceFiles = await this._getWorkspaceFilePaths();
        const attachedSafe = (msg.filePaths as string[] | undefined) ?? [];
        const filePaths = attachedSafe.length > 0
          ? [...new Set([...workspaceFiles, ...attachedSafe])]
          : workspaceFiles;
        const projectRoot = this._getCurrentRepoRoot();
        const messagesWithContext = await this._messagesWithFileContext(messages, filePaths, projectRoot ?? undefined, this._fileScopeCache);
        this._log.appendLine(`  → Payload: model=${model}, messages=${messagesWithContext.length}, filePaths=${filePaths.length}, bypassed=${bypassedFilePaths.length}, repoRoot=${projectRoot ?? "(none)"}, contextInjected=${messagesWithContext !== messages}`);
        this._logPayload("  → Request body (to /api/estimate)", { model, messages: messagesWithContext.length, metadata: { filePaths, projectRoot, bypassedFilePaths } });

        try {
          const result = await proxyClient.estimate(model, messagesWithContext, filePaths.length ? filePaths : undefined, projectRoot, bypassedFilePaths.length ? bypassedFilePaths : undefined);
          this._log.appendLine(`  ← Proxy response (estimate): OK`);
          this._logPayload("  ← Estimate result", result);
          this._postToWebview({ type: "estimateResult", data: result });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Estimate failed";
          this._log.appendLine(`  ← Proxy error: ${message}`);
          this._logPayload("  ← Error detail", err);
          this._postToWebview({ type: "error", message });
        }
        break;
      }

      case "chat": {
        const model = msg.model as string;
        const messages = (msg.messages as proxyClient.ChatMessage[]) ?? [];
        const bypassedFilePaths = (msg.bypassedFilePaths as string[] | undefined) ?? [];

        // Phase 1: Thinking
        this._postToWebview({ type: "agentPhase", phase: "thinking", label: "Thinking…" });

        // Read current repository and apply user's restrictions (from proxy file scope)
        const workspaceFiles = await this._getWorkspaceFilePaths();
        const attachedSafe = (msg.filePaths as string[] | undefined) ?? [];
        const filePaths = attachedSafe.length > 0
          ? [...new Set([...workspaceFiles, ...attachedSafe])]
          : workspaceFiles;
        const projectRoot = this._getCurrentRepoRoot();

        // Phase 2: Reading files
        if (filePaths.length > 0) {
          this._postToWebview({ type: "agentPhase", phase: "reading", label: `Reading ${filePaths.length} file${filePaths.length > 1 ? "s" : ""}…` });
        }

        const messagesWithContext = await this._messagesWithFileContext(messages, filePaths, projectRoot ?? undefined, this._fileScopeCache);
        this._log.appendLine(`  → Payload: model=${model}, messages=${messagesWithContext.length}, filePaths=${filePaths.length}, bypassed=${bypassedFilePaths.length}, repoRoot=${projectRoot ?? "(none)"}, contextInjected=${messagesWithContext !== messages}`);
        this._logPayload("  → Request body (to /v1/chat/completions)", { model, messages: messagesWithContext.length, metadata: { filePaths, projectRoot, bypassedFilePaths } });

        // Phase 3: Generating
        this._postToWebview({ type: "agentPhase", phase: "writing", label: "Generating…" });

        try {
          const response = await proxyClient.chatCompletion(model, messagesWithContext, filePaths.length ? filePaths : undefined, projectRoot, bypassedFilePaths.length ? bypassedFilePaths : undefined);
          this._log.appendLine(`  ← Proxy response (chat): OK`);
          this._logPayload("  ← Chat response (summary)", {
            choices: response.choices?.length,
            _firewall: response._firewall
          });

          // Parse LLM response for agentic file operations (create/edit tags)
          const responseContent = response.choices?.[0]?.message?.content ?? "";
          const fileOps = this._parseFileOperations(responseContent);

          // Phase 4: Applying (if file ops present)
          if (fileOps.length > 0) {
            this._postToWebview({ type: "agentPhase", phase: "applying", label: `Applying ${fileOps.length} change${fileOps.length > 1 ? "s" : ""}…` });
            this._postToWebview({ type: "fileOperations", operations: fileOps });
          }

          // Parse and execute run_command tags
          const commands = this._parseRunCommands(responseContent);
          if (commands.length > 0) {
            this._postToWebview({ type: "agentPhase", phase: "running", label: `Running ${commands.length} command${commands.length > 1 ? "s" : ""}…` });
            this._executeCommands(commands, projectRoot ?? undefined);
          }

          // Phase done
          this._postToWebview({ type: "agentPhase", phase: "done", label: "" });
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
          const message = err instanceof Error ? err.message : "Request failed";
          this._log.appendLine(`  ← Proxy error: ${message}`);
          this._logPayload("  ← Error detail", err);
          this._postToWebview({ type: "agentPhase", phase: "done", label: "" });
          this._postToWebview({ type: "chatError", message });
        }
        break;
      }

      case "loadProviders": {
        this._log.appendLine("  → Loading providers from proxy");
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

      // ── @ Mention file search ──────────────────────────────────────────
      case "requestMentionSearch": {
        const query = String(msg.query ?? "");
        const results = this._fileIndexer.search(query, 25);
        this._postToWebview({ type: "mentionSearchResults", results });
        break;
      }

      // ── Read @mentioned file contents before sending ───────────────────
      case "readMentionedFiles": {
        const paths = (msg.paths as string[]) ?? [];
        const root = this._getCurrentRepoRoot();
        const context = root ? await this._readMentionedFilesContext(paths, root) : "";
        this._postToWebview({ type: "mentionedFilesContent", context });
        break;
      }

      // ── Load model catalog ─────────────────────────────────────────────
      case "loadCatalog": {
        try {
          const catalog = await proxyClient.getModelCatalog();
          this._postToWebview({ type: "catalog", data: catalog });
        } catch {
          this._postToWebview({ type: "catalog", data: [] });
        }
        break;
      }

      // ── Add provider with batch models from catalog ────────────────────
      case "addProviderWithModels": {
        try {
          const providerData = msg.provider as { name: string; apiKey: string; baseUrl: string };
          const catalogModels = (msg.models as proxyClient.CatalogModel[]) ?? [];
          const newProvider = await proxyClient.addProvider(providerData.name, providerData.apiKey, providerData.baseUrl);
          let added = 0;
          for (const m of catalogModels) {
            try {
              await proxyClient.addModelWithMeta(newProvider.id, m);
              added++;
            } catch {
              // skip duplicate/failed
            }
          }
          const [providers, models] = await Promise.all([proxyClient.listProviders(), proxyClient.listModels()]);
          this._postToWebview({ type: "providers", data: providers });
          this._postToWebview({ type: "models", data: models });
          this._postToWebview({ type: "toast", message: `${providerData.name} added with ${added} model(s)` });
        } catch (err) {
          this._postToWebview({ type: "error", message: err instanceof Error ? err.message : "Failed to add provider" });
        }
        break;
      }

      // ── Auto-apply all file operations (agent direct-edit mode) ────────
      case "applyAllFileOps": {
        const ops = (msg.operations as Array<{ opType: string; filePath: string; content: string }>) ?? [];
        const root = this._getCurrentRepoRoot();
        if (!root) {
          this._postToWebview({ type: "toast", message: "Cannot apply: no workspace root." });
          break;
        }
        const results: string[] = [];
        for (const op of ops) {
          const abs = path.isAbsolute(op.filePath) ? op.filePath : path.join(root, op.filePath);
          const uri = vscode.Uri.file(abs);
          try {
            const dir = vscode.Uri.file(path.dirname(abs));
            await vscode.workspace.fs.createDirectory(dir);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(op.content, "utf-8"));
            results.push(op.filePath);
          } catch {
            // skip
          }
        }
        if (results.length > 0) {
          // Open the last modified file
          const lastUri = vscode.Uri.file(path.isAbsolute(results[results.length - 1]) ? results[results.length - 1] : path.join(root, results[results.length - 1]));
          try {
            const doc = await vscode.workspace.openTextDocument(lastUri);
            await vscode.window.showTextDocument(doc, { preview: true });
          } catch { /* ignore */ }
          this._postToWebview({ type: "toast", message: `Applied ${results.length} file change(s): ${results.slice(0, 3).join(", ")}${results.length > 3 ? "…" : ""}` });
        }
        break;
      }

      // ── Apply LLM-generated file operations (create/edit) ─────────────
      case "applyFileOperation": {
        const opType = String(msg.opType ?? "");
        const filePath = String(msg.filePath ?? "");
        const content = String(msg.content ?? "");
        const root = this._getCurrentRepoRoot();

        if (!filePath || !root) {
          this._postToWebview({ type: "toast", message: "Cannot apply: no workspace root found." });
          break;
        }

        const abs = path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
        const uri = vscode.Uri.file(abs);

        try {
          if (opType === "create") {
            // Ensure parent directories exist
            const dir = vscode.Uri.file(path.dirname(abs));
            await vscode.workspace.fs.createDirectory(dir);
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf-8"));
            this._postToWebview({ type: "toast", message: `Created: ${filePath}` });

          } else if (opType === "edit") {
            // Validate the file exists before editing
            try {
              await vscode.workspace.fs.stat(uri);
            } catch {
              // File doesn't exist — create it
              const dir = vscode.Uri.file(path.dirname(abs));
              await vscode.workspace.fs.createDirectory(dir);
            }
            await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf-8"));
            this._postToWebview({ type: "toast", message: `Updated: ${filePath}` });
          }

          // Open the file in the editor so user sees the result
          const doc = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(doc, { preview: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to apply operation";
          this._postToWebview({ type: "toast", message: `Error: ${message}` });
        }
        break;
      }
    }
  }

  /** Read @mentioned files and format them as structured XML context */
  private async _readMentionedFilesContext(paths: string[], projectRoot: string): Promise<string> {
    const MAX_FILE_CHARS = 50 * 1024; // 50 KB per file
    const MAX_TOTAL_CHARS = 100_000;
    const extToLang: Record<string, string> = {
      ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
      ".json": "json", ".html": "html", ".css": "css", ".md": "markdown", ".py": "python",
      ".go": "go", ".rs": "rust", ".java": "java", ".rb": "ruby", ".sh": "shell",
      ".c": "c", ".cpp": "cpp", ".h": "c", ".cs": "csharp", ".php": "php",
      ".swift": "swift", ".kt": "kotlin", ".yaml": "yaml", ".yml": "yaml", ".toml": "toml"
    };

    const parts: string[] = [];
    let totalChars = 0;

    for (const rel of paths) {
      if (totalChars >= MAX_TOTAL_CHARS) break;

      const abs = path.isAbsolute(rel) ? rel : path.join(projectRoot, rel);

      // Reject binary files
      if (isBinaryPath(rel)) {
        parts.push(`<!-- ${rel}: binary file skipped -->`);
        continue;
      }

      try {
        const uri = vscode.Uri.file(abs);
        const stat = await vscode.workspace.fs.stat(uri);

        // Warn about very large files (> 500 KB)
        if (stat.size > 500 * 1024) {
          parts.push(`<!-- ${rel}: file too large (${Math.round(stat.size / 1024)} KB), skipped. Use specific line ranges instead. -->`);
          continue;
        }

        const doc = await vscode.workspace.openTextDocument(uri);
        let text = doc.getText();

        if (text.length > MAX_FILE_CHARS) {
          text = text.slice(0, MAX_FILE_CHARS) + "\n\n... (truncated — file too large)";
        }
        if (totalChars + text.length > MAX_TOTAL_CHARS) {
          text = text.slice(0, MAX_TOTAL_CHARS - totalChars) + "\n\n... (truncated — total context limit reached)";
        }

        totalChars += text.length;
        const ext = path.extname(rel).toLowerCase();
        const lang = extToLang[ext] ?? "text";
        parts.push(`<file path="${rel}" language="${lang}">\n${text}\n</file>`);
      } catch {
        parts.push(`<!-- ${rel}: could not be read -->`);
      }
    }

    return parts.join("\n\n");
  }

  /** Parse <run_command> tags from LLM response */
  private _parseRunCommands(content: string): string[] {
    const commands: string[] = [];
    const regex = /<run_command>([\s\S]*?)<\/run_command>/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(content)) !== null) {
      const cmd = m[1].trim();
      if (cmd) commands.push(cmd);
    }
    return commands;
  }

  /** Execute shell commands and send output to webview */
  private _executeCommands(commands: string[], cwd?: string): void {
    const workdir = cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    for (const cmd of commands) {
      execAsync(cmd, { cwd: workdir, timeout: 30_000 })
        .then(({ stdout, stderr }) => {
          const output = (stdout + (stderr ? `\n[stderr]\n${stderr}` : "")).trim();
          this._postToWebview({ type: "commandOutput", command: cmd, output, exitCode: 0 });
        })
        .catch((err: { stderr?: string; stdout?: string; message?: string; code?: number }) => {
          const output = ((err.stdout ?? "") + "\n" + (err.stderr ?? err.message ?? "")).trim();
          this._postToWebview({ type: "commandOutput", command: cmd, output, exitCode: err.code ?? 1 });
        });
    }
  }

  /** Parse LLM response content for agentic XML file operation tags */
  private _parseFileOperations(content: string): Array<{ type: "create" | "edit"; path: string; content: string }> {
    const ops: Array<{ type: "create" | "edit"; path: string; content: string }> = [];
    const createRegex = /<create_file\s+path="([^"]+)">([\s\S]*?)<\/create_file>/g;
    const editRegex = /<edit_file\s+path="([^"]+)">([\s\S]*?)<\/edit_file>/g;

    let m: RegExpExecArray | null;
    while ((m = createRegex.exec(content)) !== null) {
      ops.push({ type: "create", path: m[1].trim(), content: m[2] });
    }
    while ((m = editRegex.exec(content)) !== null) {
      ops.push({ type: "edit", path: m[1].trim(), content: m[2] });
    }
    return ops;
  }

  private async _sendInitialData(): Promise<void> {
    const config = vscode.workspace.getConfiguration("aiFirewall");
    this._postToWebview({
      type: "config",
      data: {
        proxyUrl: config.get<string>("proxyUrl"),
        defaultModel: config.get<string>("defaultModel"),
        showPreFlight: config.get<boolean>("showPreFlight"),
        autoRedact: config.get<boolean>("autoRedact"),
        hasToken: !!(config.get<string>("apiToken") || "").trim()
      }
    });

    const healthy = await proxyClient.checkHealth();
    this._postToWebview({ type: "connectionStatus", connected: healthy });

    if (healthy) {
      // Auth status (login-first)
      try {
        const me = await proxyClient.me();
        this._postToWebview({ type: "authStatus", authed: true, user: me.user });
      } catch {
        this._postToWebview({ type: "authStatus", authed: false });
      }

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

  /** Current repository root in the IDE: folder of the active editor, or first workspace folder. */
  private _getCurrentRepoRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return undefined;
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor?.document?.uri) {
      const folder = vscode.workspace.getWorkspaceFolder(activeEditor.document.uri);
      if (folder) return folder.uri.fsPath;
    }
    return folders[0].uri.fsPath;
  }

  /** Read file contents from the current repository and format as code context (Copilot/Cursor-style). */
  private async _readWorkspaceFileContext(
    filePaths: string[],
    projectRoot: string,
    maxFileSizeKb: number = 50,
    maxTotalChars: number = 80_000,
    maxFiles: number = 25
  ): Promise<string> {
    if (filePaths.length === 0) return "";
    const maxCharsPerFile = maxFileSizeKb * 1024;
    let totalChars = 0;
    const parts: string[] = [];
    const extToLang: Record<string, string> = {
      ".ts": "typescript", ".tsx": "typescript", ".js": "javascript", ".jsx": "javascript",
      ".json": "json", ".html": "html", ".css": "css", ".md": "markdown", ".py": "python",
      ".go": "go", ".rs": "rust", ".java": "java", ".rb": "ruby", ".sh": "shell"
    };
    for (let i = 0; i < filePaths.length && i < maxFiles && totalChars < maxTotalChars; i++) {
      const rel = filePaths[i];
      const absolutePath = path.isAbsolute(rel) ? rel : path.join(projectRoot, rel);
      const uri = vscode.Uri.file(absolutePath);
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        let text = doc.getText();
        if (text.length > maxCharsPerFile) text = text.slice(0, maxCharsPerFile) + "\n\n... (truncated)";
        if (totalChars + text.length > maxTotalChars) {
          text = text.slice(0, maxTotalChars - totalChars) + "\n\n... (truncated)";
        }
        totalChars += text.length;
        const ext = path.extname(rel);
        const lang = extToLang[ext] ?? "";
        const fence = lang ? lang : "text";
        parts.push(`## ${rel}\n\`\`\`${fence}\n${text}\n\`\`\``);
      } catch {
        // Skip binary or unreadable files
      }
    }
    if (parts.length === 0) return "";
    return "\n\n--- Code context (current repository) ---\n\n" + parts.join("\n\n");
  }

  /** Files to exclude from context injection: lockfiles and similar contain hashes that trigger false-positive secret detection. */
  private static readonly CONTEXT_EXCLUDE_PATTERNS = [
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
    "bun.lockb",
    ".min.js",
    ".bundle.js"
  ];

  private _isExcludedFromContext(relPath: string): boolean {
    const normalised = relPath.replace(/\\/g, "/");
    const base = path.basename(normalised);
    if (ChatViewProvider.CONTEXT_EXCLUDE_PATTERNS.some((p) => base === p || base.endsWith(p))) return true;
    if (normalised.includes("node_modules") || normalised.includes("dist/") || normalised.includes(".git/")) return true;
    return false;
  }

  /** Inject file context into the last user message so the model sees the code (like Copilot/Cursor). */
  private async _messagesWithFileContext(
    messages: proxyClient.ChatMessage[],
    filePaths: string[],
    projectRoot: string | undefined,
    fileScope: proxyClient.FileScopeConfig | null
  ): Promise<proxyClient.ChatMessage[]> {
    if (filePaths.length === 0 || !projectRoot) return messages;
    const scope = fileScope ?? undefined;
    const safeForContext = filePaths.filter(
      (p) => !this._isExcludedFromContext(p) && (!scope || !this._isRestricted(p, scope))
    );
    if (safeForContext.length === 0) return messages;
    const maxKb = fileScope?.max_file_size_kb ?? 500;
    const context = await this._readWorkspaceFileContext(safeForContext, projectRoot, Math.min(maxKb, 50), 80_000, 25);
    if (!context) return messages;
    const out = [...messages];
    const lastUserIndex = out.map((m, i) => ({ i, role: m.role })).filter((x) => x.role === "user").pop()?.i ?? -1;
    if (lastUserIndex >= 0 && out[lastUserIndex].content) {
      out[lastUserIndex] = {
        ...out[lastUserIndex],
        content: out[lastUserIndex].content + context
      };
    } else {
      out.push({ role: "user", content: "Context from the current repository:" + context });
    }
    return out;
  }

  private _toRelativePath(fsPath: string): string {
    const root = this._getCurrentRepoRoot();
    if (root && fsPath.startsWith(root)) {
      return fsPath.slice(root.length).replace(/^\/+/, "") || fsPath;
    }
    return fsPath;
  }

  private _isRestricted(relPath: string, scope: proxyClient.FileScopeConfig): boolean {
    const blocklist = scope.blocklist ?? [];
    return blocklist.some((pattern) => {
      // Simple glob matching: exact match, prefix match for ** patterns, or suffix match
      if (pattern === relPath) return true;
      // Handle **/* style patterns
      if (pattern.startsWith("**/")) {
        const suffix = pattern.slice(3);
        if (relPath.endsWith(suffix) || relPath.includes("/" + suffix)) return true;
        // Handle **/dir/** patterns
        const inner = pattern.replace(/\*\*/g, "").replace(/\//g, "");
        if (inner && relPath.includes(inner)) return true;
      }
      // Handle dir/** patterns
      if (pattern.endsWith("/**")) {
        const prefix = pattern.slice(0, -3);
        if (relPath.startsWith(prefix + "/") || relPath === prefix) return true;
      }
      // Handle *.ext patterns
      if (pattern.startsWith("*.")) {
        const ext = pattern.slice(1);
        if (relPath.endsWith(ext)) return true;
      }
      // Handle .env.* style patterns
      if (pattern.includes("*")) {
        const [before, after] = pattern.split("*");
        const base = relPath.split("/").pop() ?? relPath;
        if (before && after) {
          if (base.startsWith(before) && base.endsWith(after)) return true;
        } else if (before) {
          if (base.startsWith(before)) return true;
        }
      }
      return false;
    });
  }

  private async _getWorkspaceFilePaths(): Promise<string[]> {
    const root = this._getCurrentRepoRoot();
    if (!root) return [];

    // Always fetch latest file scope from proxy so user's restrictions are applied
    try {
      const res = await proxyClient.getFileScope();
      this._fileScopeCache = res.file_scope;
    } catch {
      if (!this._fileScopeCache) {
        this._fileScopeCache = {
          mode: "blocklist",
          blocklist: ["**/node_modules/**", "**/dist/**", "**/.git/**", ".env", ".env.*", "**/*.pem", "**/*.key", "**/secrets/**", "**/credentials/**"],
          allowlist: [],
          max_file_size_kb: 500,
          scan_on_open: false,
          scan_on_send: true
        };
      }
    }

    const scope = this._fileScopeCache!;
    const blocklist = scope.blocklist ?? [];
    const excludeGlobs = blocklist.filter(Boolean);
    const exclude = excludeGlobs.length ? `{${excludeGlobs.join(",")}}` : undefined;

    // Read current repository in the IDE (only the active workspace folder)
    const rootUri = vscode.Uri.file(root);
    const includePattern = new vscode.RelativePattern(rootUri, "**/*");
    const uris = await vscode.workspace.findFiles(includePattern, exclude, 5000);
    const rel = (p: string) => {
      if (p.startsWith(root)) {
        const r = p.slice(root.length).replace(/^\/+/, "");
        return r || p;
      }
      return p;
    };
    const allRelative = uris.map((u) => rel(u.fsPath));

    // Filter out any path that matches the restriction list (in case findFiles exclude missed some patterns)
    const allowed = blocklist.length === 0
      ? allRelative
      : allRelative.filter((path) => !this._isRestricted(path, scope));
    return allowed;
  }

  private async _configureRestrictions(): Promise<void> {
    try {
      const current = await proxyClient.getFileScope();
      const existing = new Set(current.file_scope.blocklist ?? []);

      const picked = await vscode.window.showOpenDialog({
        canSelectMany: true,
        canSelectFiles: true,
        canSelectFolders: true,
        openLabel: "Restrict selected paths"
      });
      if (!picked || picked.length === 0) return;

      const root = this._getCurrentRepoRoot();
      for (const u of picked) {
        const p = u.fsPath;
        if (root && p.startsWith(root)) {
          const rel = p.slice(root.length).replace(/^\/+/, "");
          // Treat directories as glob
          const glob = u.path.endsWith("/") ? `${rel}/**` : rel;
          existing.add(glob);
        } else {
          existing.add(p);
        }
      }

      const updated = {
        ...current.file_scope,
        mode: "blocklist" as const,
        blocklist: Array.from(existing)
      };
      await proxyClient.updateFileScope(updated);
      this._fileScopeCache = updated;
      this._postToWebview({ type: "toast", message: "Restrictions updated. Future requests will exclude those paths." });
    } catch (err) {
      this._postToWebview({ type: "error", message: err instanceof Error ? err.message : "Failed to update restrictions" });
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
    content="default-src 'none'; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src 'unsafe-inline'; img-src data: blob: 'self';" />
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

    /* ── Chat messages ─────────────────────────────────────── */
    .chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; padding: 4px 0 8px; }

    /* User bubble — right-aligned, rounded pill */
    .msg.user { align-self: flex-end; max-width: 85%; }
    .msg-bubble { background: var(--input-bg); border: 1px solid var(--border); border-radius: 18px 18px 4px 18px; padding: 9px 14px; font-size: 13px; line-height: 1.5; word-break: break-word; white-space: pre-wrap; }

    /* Assistant message — full-width, no bubble, like Claude */
    .msg.assistant { align-self: stretch; max-width: 100%; padding: 8px 2px; font-size: 13px; line-height: 1.6; }
    .msg.assistant .markdown-preview { white-space: normal; }
    .msg.assistant .markdown-preview h1,.msg.assistant .markdown-preview h2,.msg.assistant .markdown-preview h3 { margin: 0.7em 0 0.3em; font-weight: 600; line-height: 1.3; }
    .msg.assistant .markdown-preview h1 { font-size: 1.2em; } .msg.assistant .markdown-preview h2 { font-size: 1.05em; } .msg.assistant .markdown-preview h3 { font-size: 0.95em; }
    .msg.assistant .markdown-preview p { margin: 0.45em 0; }
    .msg.assistant .markdown-preview ul,.msg.assistant .markdown-preview ol { margin: 0.4em 0; padding-left: 1.6em; }
    .msg.assistant .markdown-preview li { margin: 0.2em 0; }
    .msg.assistant .markdown-preview a { color: var(--link); text-decoration: none; } .msg.assistant .markdown-preview a:hover { text-decoration: underline; }
    .msg.assistant .markdown-preview code { font-family: var(--vscode-editor-font-family,monospace); font-size: 0.88em; background: var(--input-bg); padding: 1px 5px; border-radius: 4px; border: 1px solid var(--border); }
    .msg.assistant .markdown-preview pre { margin: 0.5em 0; }
    .msg.assistant .markdown-preview blockquote { margin: 0.5em 0; padding: 4px 12px; border-left: 3px solid var(--border); color: var(--subtle); background: var(--input-bg); border-radius: 0 4px 4px 0; }
    .msg.assistant .markdown-preview strong { font-weight: 600; }
    .msg.assistant .markdown-preview table { border-collapse: collapse; margin: 0.5em 0; font-size: 0.93em; width: 100%; }
    .msg.assistant .markdown-preview th,.msg.assistant .markdown-preview td { border: 1px solid var(--border); padding: 5px 10px; text-align: left; }
    .msg.assistant .markdown-preview th { font-weight: 600; background: var(--input-bg); }
    .msg.assistant .markdown-preview hr { border: none; border-top: 1px solid var(--border); margin: 0.8em 0; }

    /* Attached image inside user message */
    .msg-image { max-width: 100%; max-height: 200px; border-radius: 8px; margin-top: 6px; display: block; }

    /* System/status messages */
    .msg.system { background: none; color: var(--subtle); font-style: italic; font-size: 11px; align-self: center; text-align: center; padding: 4px 8px; }

    /* Typing indicator — three bouncing dots */
    .typing-indicator { display: flex; gap: 4px; padding: 12px 4px; align-items: center; }
    .typing-dot { width: 7px; height: 7px; background: var(--subtle); border-radius: 50%; animation: tdot 1.3s infinite ease-in-out; }
    .typing-dot:nth-child(2) { animation-delay: .2s; }
    .typing-dot:nth-child(3) { animation-delay: .4s; }
    @keyframes tdot { 0%,80%,100% { transform: scale(.7); opacity: .4; } 40% { transform: scale(1); opacity: 1; } }

    /* Phase indicator — Copilot/Cursor style animated status */
    .phase-indicator { padding: 8px 4px; }
    .phase-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--subtle); }
    .phase-icon { font-size: 14px; animation: phaseFloat 2s ease-in-out infinite; }
    .phase-label { font-style: italic; flex: 1; }
    .phase-dots { display: flex; gap: 3px; align-items: center; }
    @keyframes phaseFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }

    /* Typewriter streaming cursor */
    .stream-cursor { display: inline-block; width: 2px; height: 1em; background: var(--btn-bg); vertical-align: text-bottom; margin-left: 1px; animation: cursorBlink 0.7s step-end infinite; }
    @keyframes cursorBlink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }

    /* ── Composer (chat input area) ───────────────────────── */
    .chat-composer { flex-shrink: 0; border: 1px solid var(--border); border-radius: 12px; background: var(--input-bg); margin-top: 6px; transition: border-color .15s; }
    .chat-composer:focus-within { border-color: var(--btn-bg); }
    .composer-input { display: block; width: 100%; padding: 10px 14px 6px; background: transparent; color: var(--input-fg); border: none; outline: none; font-family: inherit; font-size: 13px; resize: none; min-height: 44px; max-height: 200px; line-height: 1.5; }
    .composer-input::placeholder { color: var(--subtle); }

    /* Image preview strip inside composer */
    .composer-previews { display: flex; flex-wrap: wrap; gap: 6px; padding: 4px 10px 0; }
    .preview-item { position: relative; width: 48px; height: 48px; border-radius: 6px; overflow: hidden; border: 1px solid var(--border); flex-shrink: 0; }
    .preview-item img { width: 100%; height: 100%; object-fit: cover; }
    .preview-item-file { width: 48px; height: 48px; background: var(--btn-secondary-bg); border-radius: 6px; border: 1px solid var(--border); display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 9px; color: var(--subtle); text-align: center; padding: 2px; overflow: hidden; }
    .preview-remove { position: absolute; top: 1px; right: 1px; width: 14px; height: 14px; background: rgba(0,0,0,.6); border: none; border-radius: 50%; color: #fff; font-size: 10px; line-height: 14px; text-align: center; cursor: pointer; padding: 0; display: flex; align-items: center; justify-content: center; }

    /* Composer footer action bar */
    .composer-footer { display: flex; align-items: center; justify-content: space-between; padding: 4px 8px 6px; gap: 4px; }
    .composer-left { display: flex; align-items: center; gap: 2px; }
    .composer-right { display: flex; align-items: center; gap: 4px; }

    /* Icon buttons */
    .icon-btn { background: none; border: none; padding: 5px; border-radius: 6px; color: var(--subtle); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background .12s, color .12s; }
    .icon-btn:hover { background: var(--btn-secondary-bg); color: var(--fg); }
    .icon-btn.active { color: var(--btn-bg); background: color-mix(in srgb, var(--btn-bg) 12%, transparent); }
    .icon-btn svg { width: 15px; height: 15px; }
    .icon-btn input[type=checkbox] { display: none; }

    /* Send button — round, accent colour */
    .send-icon-btn { width: 30px; height: 30px; border-radius: 50%; border: none; background: var(--btn-bg); color: var(--btn-fg); cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background .12s, opacity .12s; }
    .send-icon-btn:hover:not(:disabled) { background: var(--btn-hover); }
    .send-icon-btn:disabled { opacity: .35; cursor: not-allowed; }
    .send-icon-btn svg { width: 15px; height: 15px; }

    /* ── Provider tiles ──────────────────────────────────────── */
    .provider-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; margin-bottom: 10px; }
    .provider-tile { background: var(--input-bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 4px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 3px; transition: border-color .15s, background .15s; position: relative; }
    .provider-tile:hover { border-color: var(--btn-bg); background: color-mix(in srgb, var(--btn-bg) 6%, var(--input-bg)); }
    .provider-tile-active { border-color: var(--success); }
    .provider-tile-icon { font-size: 20px; line-height: 1; }
    .provider-tile-name { font-size: 9px; color: var(--fg); text-align: center; line-height: 1.2; word-break: break-word; }
    .provider-tile-badge { position: absolute; top: 3px; right: 3px; background: var(--success); color: #fff; border-radius: 50%; width: 12px; height: 12px; font-size: 8px; display: flex; align-items: center; justify-content: center; }
    .provider-active-list { display: flex; flex-direction: column; gap: 4px; margin-bottom: 4px; }
    .provider-active-card { display: flex; align-items: center; background: var(--input-bg); border: 1px solid var(--border); border-radius: 6px; padding: 6px 8px; gap: 6px; }
    .provider-active-info { flex: 1; min-width: 0; }
    .provider-active-name { font-size: 12px; font-weight: 600; display: block; }
    .provider-active-url { font-size: 10px; color: var(--subtle); display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .provider-active-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
    .provider-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

    /* ── Model rows ──────────────────────────────────────────── */
    .model-row { display: flex; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--border); gap: 6px; }
    .model-catalog-row { display: flex; align-items: center; padding: 5px 0; border-bottom: 1px solid var(--border); gap: 6px; }
    .model-row-info { flex: 1; min-width: 0; }
    .model-row-name { font-size: 12px; display: block; }
    .model-row-cost { font-size: 10px; color: var(--subtle); display: block; }
    .model-row-tags { display: flex; flex-wrap: wrap; gap: 2px; margin-top: 2px; }
    .model-tag { font-size: 9px; background: var(--input-bg); border: 1px solid var(--border); border-radius: 8px; padding: 0 4px; color: var(--subtle); }
    .model-status-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }

    /* Chat wrap — fills the panel with flex column layout */
    .chat-wrap { display: flex; flex-direction: column; height: 100%; min-height: 0; }

    /* Compact model selector bar */
    .model-bar { display: flex; gap: 4px; align-items: center; flex-shrink: 0; padding: 4px 0 6px; }
    .model-select-inline { flex: 1; min-width: 0; padding: 3px 6px; background: var(--input-bg); color: var(--input-fg); border: 1px solid var(--border); border-radius: 6px; font-family: inherit; font-size: 11px; }
    .agent-toggle { display: flex; align-items: center; gap: 3px; font-size: 10px; color: var(--subtle); cursor: pointer; white-space: nowrap; }
    .agent-toggle input { width: 12px; height: 12px; cursor: pointer; accent-color: var(--btn-bg); }
    .ctx-tok { font-size: 10px; color: var(--subtle); white-space: nowrap; }
    .ctx-overflow { color: var(--error); font-weight: 600; }
    .ctx-overflow-alert { font-size: 11px; color: var(--error); padding: 4px 8px; background: rgba(239,68,68,.08); border-radius: 6px; margin-bottom: 6px; flex-shrink: 0; }

    /* Empty state — centred with icon */
    .empty-icon { font-size: 28px; margin-bottom: 8px; }
    .empty-hint { font-size: 11px; margin-top: 8px; }

    /* Composer input row */
    .composer-input-row { display: flex; align-items: flex-end; }
    .composer-footer-spacer { flex: 1; }

    /* Attach button badge */
    .attach-btn { position: relative; }
    .attach-badge { position: absolute; top: 0; right: 0; background: var(--btn-bg); color: var(--btn-fg); border-radius: 50%; font-size: 8px; width: 14px; height: 14px; display: flex; align-items: center; justify-content: center; font-weight: 700; }

    /* File chips inside composer */
    .composer-file-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 10px 0; }
    .file-chip { display: flex; align-items: center; gap: 3px; background: var(--btn-secondary-bg); border: 1px solid var(--border); border-radius: 10px; padding: 2px 6px; font-size: 10px; color: var(--fg); max-width: 120px; overflow: hidden; }
    .file-chip.bypassed { border-color: var(--warning); color: var(--warning); }
    .file-chip-x { background: none; border: none; padding: 0; margin-left: 2px; color: var(--subtle); cursor: pointer; font-size: 12px; line-height: 1; }
    .file-chip-x:hover { color: var(--fg); }
    .preview-thumb { width: 100%; height: 100%; object-fit: cover; }

    button { cursor: pointer; font-family: inherit; }
    .btn { padding: 6px 12px; border: none; border-radius: 4px; font-size: 12px; }
    .btn-primary { background: var(--btn-bg); color: var(--btn-fg); }
    .btn-primary:hover { background: var(--btn-hover); }
    .btn-secondary { background: var(--btn-secondary-bg); color: var(--btn-secondary-fg); }
    .btn-danger { background: var(--error); color: #fff; }
    .btn-sm { padding: 3px 8px; font-size: 11px; }


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

    /* @ Mention chips */
    .mention-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0 2px 0; }
    .mention-chip { display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; background: var(--badge-bg); color: var(--badge-fg); border-radius: 10px; font-size: 10px; }
    .mention-chip-x { background: none; border: none; padding: 0 0 0 2px; color: inherit; opacity: 0.6; font-size: 12px; line-height: 1; cursor: pointer; }
    .mention-chip-x:hover { opacity: 1; }

    /* @ Mention dropdown */
    .mention-dropdown { position: absolute; bottom: 100%; left: 0; right: 0; max-height: 180px; overflow-y: auto; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 4px; z-index: 50; box-shadow: 0 -4px 12px rgba(0,0,0,.15); margin-bottom: 2px; }
    .mention-option { padding: 6px 10px; font-size: 11px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mention-option:hover, .mention-option.selected { background: var(--btn-bg); color: var(--btn-fg); }

    /* Accessibility */
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    :focus-visible { outline: 2px solid var(--btn-bg); outline-offset: 2px; border-radius: 2px; }
    kbd { display: inline-block; padding: 1px 4px; background: var(--input-bg); border: 1px solid var(--border); border-radius: 3px; font-family: var(--vscode-editor-font-family, monospace); font-size: 10px; }
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
