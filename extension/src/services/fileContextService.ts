/**
 * fileContextService.ts — Workspace file reading and context injection.
 *
 * Provides the Copilot/Cursor-style "codebase context" feature:
 * - Reads relevant workspace files (sorted by priority)
 * - Formats them as structured code blocks
 * - Generates a directory tree overview
 * - Injects the context into the last user message before sending to the LLM
 *
 * Security: honours the file scope blocklist/allowlist from the proxy policy.
 */

import * as path from "path";
import * as vscode from "vscode";
import { isBinaryPath } from "./fileIndexer";
import type { ChatMessage, FileScopeConfig } from "./proxyClient";

/**
 * Build the system-level instruction message injected at position 0 of every agentic chat.
 * This ensures the LLM reads the rules BEFORE anything else in the conversation.
 *
 * @param testCommand  - The detected test/build command (e.g. "npm test")
 * @param workspaceDir - Name of the workspace root folder for context
 */
export function buildAgentSystemMessage(testCommand: string, workspaceDir: string): string {
  return `You are an autonomous AI coding agent running inside VS Code for the project "${workspaceDir}".
You have full authority to create files, edit files, run commands, and fix errors without asking for permission.

## FILE OPERATIONS — mandatory XML tags (plain code blocks are NOT written to disk)

To create a new file:
<create_file path="relative/path/to/file.ts">
...complete file content here...
</create_file>

To update an existing file:
<edit_file path="relative/path/to/existing.ts">
...complete updated file content here...
</edit_file>

Rules:
- Path MUST be relative to the workspace root (never absolute)
- Content MUST be the complete file — never partial snippets
- ALWAYS use these tags when the user asks you to write/create/modify a file
- NEVER show a plain markdown code block as a substitute for file creation

## COMMANDS — mandatory run_command tags

<run_command>npm install</run_command>
<run_command>${testCommand || "npm test"}</run_command>

## AUTONOMOUS ITERATION LOOP

After every file write you MUST:
1. Run the build/typecheck: <run_command>npm run build 2>&1 | head -50</run_command>
2. Run the tests: <run_command>${testCommand || "npm test"} 2>&1 | tail -60</run_command>
3. Read the output. If there are errors or failing tests, fix the code and re-run.
4. Repeat until build and tests are green.
5. Only report "Done" when everything passes.

Do NOT stop at step 1. Do NOT ask the user whether to proceed. Act autonomously.`;
}

/** Map of file extensions to language identifiers for markdown fences */
const EXT_TO_LANG: Record<string, string> = {
  ".ts":   "typescript", ".tsx": "typescript",
  ".js":   "javascript", ".jsx": "javascript",
  ".json": "json",       ".html": "html",
  ".css":  "css",        ".md":  "markdown",
  ".py":   "python",     ".go":  "go",
  ".rs":   "rust",       ".java":"java",
  ".rb":   "ruby",       ".sh":  "shell",
  ".c":    "c",          ".cpp": "cpp",
  ".h":    "c",          ".cs":  "csharp",
  ".php":  "php",        ".swift":"swift",
  ".kt":   "kotlin",     ".yaml":"yaml",
  ".yml":  "yaml",       ".toml":"toml"
};

/** Files whose content triggers false-positive secret detection — exclude from context */
const CONTEXT_EXCLUDE_PATTERNS = [
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  ".min.js",
  ".bundle.js"
];

/** Check whether a relative file path should be excluded from context injection */
function isExcludedFromContext(relPath: string): boolean {
  const normalised = relPath.replace(/\\/g, "/");
  const base = path.basename(normalised);
  if (CONTEXT_EXCLUDE_PATTERNS.some((p) => base === p || base.endsWith(p))) return true;
  if (normalised.includes("node_modules") || normalised.includes("dist/") || normalised.includes(".git/")) return true;
  return false;
}

/**
 * Check whether a relative path is blocked by the current file scope policy.
 *
 * @param relPath  - Workspace-relative path
 * @param scope    - File scope config from the proxy (blocklist/allowlist)
 */
function isRestrictedByScope(relPath: string, scope: FileScopeConfig): boolean {
  const normalised = relPath.replace(/\\/g, "/");

  if (scope.mode === "allowlist") {
    // In allowlist mode: only paths matching an allowlist entry are allowed
    const allowed = scope.allowlist.some((pattern) =>
      normalised === pattern || normalised.startsWith(pattern + "/") || pattern === "**"
    );
    return !allowed;
  }

  // blocklist mode (default): paths matching a blocklist entry are blocked
  return scope.blocklist.some((pattern) => {
    if (pattern.includes("*")) {
      // Simple glob: `**/node_modules/**` → normalised.includes("node_modules")
      const core = pattern.replace(/\*\*/g, "").replace(/\*/g, "").replace(/\/+/g, "/").replace(/^\/|\/$/g, "");
      return core && normalised.includes(core);
    }
    return normalised === pattern || normalised.startsWith(pattern + "/");
  });
}

/**
 * Read workspace files and format them as markdown code blocks for context injection.
 *
 * @param filePaths    - Workspace-relative paths to include
 * @param projectRoot  - Absolute project root path
 * @param maxFileSizeKb   - Max bytes per file before truncation (default: 50 KB)
 * @param maxTotalChars   - Hard cap on total context characters (default: 80,000)
 * @param maxFiles        - Max number of files to include (default: 25)
 */
export async function readWorkspaceFileContext(
  filePaths: string[],
  projectRoot: string,
  maxFileSizeKb = 50,
  maxTotalChars = 80_000,
  maxFiles = 25
): Promise<string> {
  if (filePaths.length === 0) return "";

  const maxCharsPerFile = maxFileSizeKb * 1024;
  let totalChars = 0;
  const parts: string[] = [];

  for (let i = 0; i < filePaths.length && i < maxFiles && totalChars < maxTotalChars; i++) {
    const rel = filePaths[i];
    if (isBinaryPath(rel)) continue;

    const absolutePath = path.isAbsolute(rel) ? rel : path.join(projectRoot, rel);
    const uri = vscode.Uri.file(absolutePath);

    try {
      const doc = await vscode.workspace.openTextDocument(uri);
      let text = doc.getText();

      if (text.length > maxCharsPerFile) {
        text = text.slice(0, maxCharsPerFile) + "\n\n... (truncated)";
      }
      if (totalChars + text.length > maxTotalChars) {
        text = text.slice(0, maxTotalChars - totalChars) + "\n\n... (truncated)";
      }

      totalChars += text.length;
      const ext = path.extname(rel).toLowerCase();
      const lang = EXT_TO_LANG[ext] ?? "text";
      parts.push(`## ${rel}\n\`\`\`${lang}\n${text}\n\`\`\``);
    } catch {
      // Skip binary or unreadable files silently
    }
  }

  if (parts.length === 0) return "";
  return "\n\n--- Code context (current repository) ---\n\n" + parts.join("\n\n");
}

/**
 * Read @mentioned files and format them as `<file>` XML elements for the system message.
 *
 * @param paths       - Workspace-relative paths the user mentioned with @
 * @param projectRoot - Absolute project root path
 */
export async function readMentionedFilesContext(
  paths: string[],
  projectRoot: string
): Promise<string> {
  const MAX_FILE_CHARS = 50 * 1024; // 50 KB per file
  const MAX_TOTAL_CHARS = 100_000;

  const parts: string[] = [];
  let totalChars = 0;

  for (const rel of paths) {
    if (totalChars >= MAX_TOTAL_CHARS) break;
    if (isBinaryPath(rel)) {
      parts.push(`<!-- ${rel}: binary file skipped -->`);
      continue;
    }

    const abs = path.isAbsolute(rel) ? rel : path.join(projectRoot, rel);
    const uri = vscode.Uri.file(abs);

    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size > 500 * 1024) {
        parts.push(`<!-- ${rel}: file too large (${Math.round(stat.size / 1024)} KB), skipped -->`);
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
      const lang = EXT_TO_LANG[ext] ?? "text";
      parts.push(`<file path="${rel}" language="${lang}">\n${text}\n</file>`);
    } catch {
      parts.push(`<!-- ${rel}: could not be read -->`);
    }
  }

  return parts.join("\n\n");
}

/**
 * Build a compact directory tree string from a list of relative paths.
 *
 * @param paths   - Workspace-relative file paths
 * @param maxFiles - Cap on how many paths to include in the tree (default: 500)
 */
export function buildDirectoryTree(paths: string[], maxFiles = 500): string {
  if (paths.length === 0) return "";

  const tree: Record<string, unknown> = {};
  const limited = paths.slice(0, maxFiles);

  for (const p of limited) {
    const parts = p.split(/[/\\]/).filter(Boolean);
    let curr = tree;
    for (const part of parts) {
      if (!curr[part]) curr[part] = {};
      curr = curr[part] as Record<string, unknown>;
    }
  }

  function render(node: Record<string, unknown>, indent = ""): string {
    return Object.keys(node)
      .map((k) => {
        const children = node[k] as Record<string, unknown>;
        const hasChildren = Object.keys(children).length > 0;
        return `${indent}${k}${hasChildren ? "/\n" + render(children, indent + "  ") : ""}`;
      })
      .join("\n");
  }

  const suffix = paths.length > maxFiles ? `\n... (${paths.length - maxFiles} more files)` : "";
  return `--- Project structure ---\n${render(tree)}${suffix}`;
}

/**
 * Priority-sort files so that documentation, configs, and entry points appear first.
 * This ensures the most relevant context is included within the character budget.
 */
export function prioritisedFiles(filePaths: string[]): string[] {
  const priority = [
    "README", "package.json", "tsconfig.json",
    "index.", "main.", "App.", "server.", "api."
  ];

  return [...filePaths].sort((a, b) => {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    const aScore = priority.findIndex((p) => aLower.includes(p.toLowerCase()));
    const bScore = priority.findIndex((p) => bLower.includes(p.toLowerCase()));
    if (aScore !== -1 && bScore === -1) return -1;
    if (aScore === -1 && bScore !== -1) return 1;
    if (aScore !== -1 && bScore !== -1) return aScore - bScore;
    return a.split("/").length - b.split("/").length; // shallower files first
  });
}

/**
 * Inject workspace file context into the last user message (Copilot/Cursor pattern).
 * Skips excluded and restricted files, builds a directory tree, and appends instructions
 * for the LLM to use XML tags when creating/editing files.
 *
 * @param messages    - Current conversation history
 * @param filePaths   - All workspace file paths
 * @param projectRoot - Absolute root path
 * @param fileScope   - Current file scope policy (may be null)
 * @param log         - Log output channel (optional)
 */
export async function messagesWithFileContext(
  messages: ChatMessage[],
  filePaths: string[],
  projectRoot: string | undefined,
  fileScope: FileScopeConfig | null,
  log?: vscode.OutputChannel
): Promise<ChatMessage[]> {
  if (filePaths.length === 0 || !projectRoot) return messages;

  const tree = buildDirectoryTree(filePaths);

  const sorted = prioritisedFiles(filePaths);
  const scope = fileScope ?? undefined;
  const safeForContext = sorted.filter(
    (p) => !isExcludedFromContext(p) && (!scope || !isRestrictedByScope(p, scope))
  );

  const maxKb = fileScope?.max_file_size_kb ?? 500;
  const context = await readWorkspaceFileContext(
    safeForContext, projectRoot, Math.min(maxKb, 50), 60_000, 15
  );

  log?.appendLine(
    `[Context] Injected ${safeForContext.length}/${sorted.length} files` +
    (safeForContext.length < sorted.length
      ? ` (${sorted.length - safeForContext.length} restricted/excluded)`
      : "")
  );

  // Instructions come FIRST so the LLM sees them before the potentially long file context
  let finalContext = "";
  finalContext += "⚡ AGENT MODE — ALWAYS follow these rules:\n";
  finalContext += "• File writes MUST use XML tags — plain code blocks are NOT applied to disk:\n";
  finalContext += '  <create_file path="src/foo.ts">...full file content...</create_file>\n';
  finalContext += '  <edit_file path="src/foo.ts">...full updated content...</edit_file>\n';
  finalContext += "• Shell commands MUST use: <run_command>npm test</run_command>\n";
  finalContext += "• After writing code ALWAYS run build/tests with <run_command> tags.\n";
  finalContext += "• Fix any failures and re-run until everything passes. Do NOT stop at the first error.\n";
  finalContext += "• Never ask for permission. Act autonomously.\n\n";
  finalContext += tree;
  if (context) finalContext += "\n" + context;

  const out = [...messages];
  const lastUserIdx = out.map((m, i) => ({ i, role: m.role }))
    .filter((x) => x.role === "user")
    .pop()?.i ?? -1;

  if (lastUserIdx >= 0 && out[lastUserIdx].content) {
    out[lastUserIdx] = {
      ...out[lastUserIdx],
      content: out[lastUserIdx].content + "\n\n" + finalContext
    };
  } else {
    out.push({ role: "user", content: "Context from the current repository:\n\n" + finalContext });
  }

  return out;
}
