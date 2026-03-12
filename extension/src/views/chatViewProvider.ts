import * as path from "path";
import * as vscode from "vscode";
import { FileIndexer, isBinaryPath } from "../services/fileIndexer";
import * as proxyClient from "../services/proxyClient";
import { updateAfterRequest } from "../statusBar";

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

        this._postToWebview({ type: "attachedFiles", safeFiles, bypassedFiles });
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
        // Read current repository and apply user's restrictions (from proxy file scope)
        const workspaceFiles = await this._getWorkspaceFilePaths();
        const attachedSafe = (msg.filePaths as string[] | undefined) ?? [];
        const filePaths = attachedSafe.length > 0
          ? [...new Set([...workspaceFiles, ...attachedSafe])]
          : workspaceFiles;
        const projectRoot = this._getCurrentRepoRoot();
        const messagesWithContext = await this._messagesWithFileContext(messages, filePaths, projectRoot ?? undefined, this._fileScopeCache);
        this._log.appendLine(`  → Payload: model=${model}, messages=${messagesWithContext.length}, filePaths=${filePaths.length}, bypassed=${bypassedFilePaths.length}, repoRoot=${projectRoot ?? "(none)"}, contextInjected=${messagesWithContext !== messages}`);
        this._logPayload("  → Request body (to /v1/chat/completions)", { model, messages: messagesWithContext.length, metadata: { filePaths, projectRoot, bypassedFilePaths } });

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
          if (fileOps.length > 0) {
            this._postToWebview({ type: "fileOperations", operations: fileOps });
          }

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
    content="default-src 'none'; script-src 'nonce-${nonce}' ${webview.cspSource}; style-src 'unsafe-inline';" />
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
    .msg.assistant .markdown-preview { white-space: normal; }
    .msg.assistant .markdown-preview h1, .msg.assistant .markdown-preview h2, .msg.assistant .markdown-preview h3 { margin: 0.6em 0 0.3em; font-weight: 600; line-height: 1.3; }
    .msg.assistant .markdown-preview h1 { font-size: 1.25em; }
    .msg.assistant .markdown-preview h2 { font-size: 1.1em; }
    .msg.assistant .markdown-preview h3 { font-size: 1em; }
    .msg.assistant .markdown-preview p { margin: 0.4em 0; }
    .msg.assistant .markdown-preview ul, .msg.assistant .markdown-preview ol { margin: 0.4em 0; padding-left: 1.5em; }
    .msg.assistant .markdown-preview li { margin: 0.2em 0; }
    .msg.assistant .markdown-preview a { color: var(--link); text-decoration: none; }
    .msg.assistant .markdown-preview a:hover { text-decoration: underline; }
    .msg.assistant .markdown-preview code { font-family: var(--vscode-editor-font-family, monospace); font-size: 0.9em; background: var(--bg); padding: 1px 4px; border-radius: 3px; }
    .msg.assistant .markdown-preview pre { margin: 0.4em 0; }
    .msg.assistant .markdown-preview blockquote { margin: 0.4em 0; padding-left: 1em; border-left: 3px solid var(--border); color: var(--subtle); }
    .msg.assistant .markdown-preview strong { font-weight: 600; }
    .msg.assistant .markdown-preview table { border-collapse: collapse; margin: 0.4em 0; font-size: 0.95em; }
    .msg.assistant .markdown-preview th, .msg.assistant .markdown-preview td { border: 1px solid var(--border); padding: 4px 8px; text-align: left; }
    .msg.assistant .markdown-preview th { font-weight: 600; background: var(--input-bg); }
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

    /* @ Mention chips */
    .mention-chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 0 2px 0; }
    .mention-chip { display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px; background: var(--badge-bg); color: var(--badge-fg); border-radius: 10px; font-size: 10px; }
    .mention-chip-x { background: none; border: none; padding: 0 0 0 2px; color: inherit; opacity: 0.6; font-size: 12px; line-height: 1; cursor: pointer; }
    .mention-chip-x:hover { opacity: 1; }

    /* @ Mention dropdown */
    .mention-dropdown { position: absolute; bottom: 100%; left: 0; right: 0; max-height: 180px; overflow-y: auto; background: var(--input-bg); border: 1px solid var(--input-border); border-radius: 4px; z-index: 50; box-shadow: 0 -4px 12px rgba(0,0,0,.15); margin-bottom: 2px; }
    .mention-option { padding: 6px 10px; font-size: 11px; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .mention-option:hover, .mention-option.selected { background: var(--btn-bg); color: var(--btn-fg); }
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
