/**
 * commandSecurity.ts — Command execution safety layer.
 *
 * All commands suggested by the LLM are vetted here before running.
 * Three tiers:
 *   1. BLOCKED  — never runs (destructive / supply-chain attacks)
 *   2. TERMINAL — launched in a visible VS Code terminal (long-running servers)
 *   3. EXEC     — runs via child_process.exec and captures output (one-shot)
 */

import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";

const execAsync = promisify(exec);

// ── Blocklist: commands that must never execute unattended ─────────────────
const DESTRUCTIVE_COMMANDS = new Set([
  "rm", "rmdir", "del", "rd", "format", "dd", "mkfs", "shred",
  "fdisk", "parted", "wipefs", "truncate", "> /dev/", "chmod 777",
  ":(){ :|:& };:", "fork bomb"
]);

/** Remote pipe pattern: curl/wget piped to a shell interpreter (supply-chain attack vector) */
const REMOTE_PIPE_PATTERN = /\b(curl|wget|fetch)\b.*\|\s*(bash|sh|zsh|fish|python|node)/i;

/** Long-running servers that should run in a visible VS Code terminal, not silent exec */
const LONG_RUNNING_PATTERN = /^(npm\s+(start|run\s+dev|run\s+serve)|yarn\s+(start|dev|serve)|pnpm\s+(start|dev)|python\s+\S+\.py|node\s+\S+|ts-node\s+\S+|flask\s+run|uvicorn|fastapi|rails\s+s|rails\s+server|php\s+-S|go\s+run|cargo\s+run|dotnet\s+run)\b/i;

export type CommandResult = { command: string; output: string; exitCode: number };

/**
 * Check if a command is destructive or dangerous.
 *
 * @param cmd - The shell command string to evaluate
 * @returns A human-readable block reason, or `undefined` if the command is safe
 */
export function isDestructiveCommand(cmd: string): string | undefined {
  // Remote pipe: curl|wget piped to a shell interpreter
  if (REMOTE_PIPE_PATTERN.test(cmd)) {
    return `Remote pipe execution blocked: "${cmd.slice(0, 80)}"`;
  }

  // First token matches known destructive commands
  const firstToken = cmd.toLowerCase().trim().split(/\s+/)[0];
  if (DESTRUCTIVE_COMMANDS.has(firstToken)) {
    return `Destructive command blocked: "${firstToken}"`;
  }

  // rm -rf and its flag variants
  if (/\brm\b.*-[a-z]*r[a-z]*f/i.test(cmd) || /\brm\b.*-[a-z]*f[a-z]*r/i.test(cmd)) {
    return `Destructive command blocked: rm -rf`;
  }

  // Path traversal in arguments (potential escape from workspace sandbox)
  if (/\.\.[/\\]/.test(cmd)) {
    return `Path traversal in command blocked: "${cmd.slice(0, 80)}"`;
  }

  return undefined;
}

/**
 * Execute a list of shell commands with security checks.
 *
 * - Destructive commands are blocked and reported without executing.
 * - Long-running processes are launched in a visible VS Code terminal.
 * - One-shot commands run via `exec` and their output is captured.
 *
 * @param commands     - The commands to run
 * @param cwd          - Working directory (defaults to first workspace folder)
 * @param agentTermRef - Mutable ref to the shared agent terminal (reused across calls)
 * @param onOutput     - Callback for each command result (for webview notification)
 * @returns Array of command results (output + exit code)
 */
export async function executeCommandsSecure(
  commands: string[],
  cwd: string | undefined,
  agentTermRef: { current: vscode.Terminal | undefined },
  onOutput: (result: CommandResult) => void
): Promise<CommandResult[]> {
  const workdir = cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const results: CommandResult[] = [];

  for (const cmd of commands) {
    // 1. Security gate — block destructive commands
    const blockReason = isDestructiveCommand(cmd);
    if (blockReason) {
      const output = `[AI Firewall blocked this command]\n${blockReason}`;
      const result = { command: cmd, output, exitCode: 1 };
      onOutput(result);
      results.push(result);
      vscode.window.showWarningMessage(`AI Firewall blocked: ${blockReason}`);
      continue;
    }

    // 2. Long-running process → VS Code terminal (user-visible and user-controlled)
    if (LONG_RUNNING_PATTERN.test(cmd.trim())) {
      if (!agentTermRef.current || agentTermRef.current.exitStatus !== undefined) {
        agentTermRef.current = vscode.window.createTerminal({
          name: "AI Firewall Agent",
          cwd: workdir
        });
      }
      agentTermRef.current.show(true);
      agentTermRef.current.sendText(cmd);
      const result = { command: cmd, output: `[Running in terminal: ${cmd}]`, exitCode: 0 };
      onOutput(result);
      results.push(result);
      continue;
    }

    // 3. One-shot command → exec + capture output
    try {
      const { stdout, stderr } = await execAsync(cmd, { cwd: workdir, timeout: 60_000 });
      const output = (stdout + (stderr ? `\n[stderr]\n${stderr}` : "")).trim();
      const result = { command: cmd, output, exitCode: 0 };
      onOutput(result);
      results.push(result);
    } catch (err) {
      const e = err as { stderr?: string; stdout?: string; message?: string; code?: number };
      const output = ((e.stdout ?? "") + "\n" + (e.stderr ?? e.message ?? "")).trim();
      const result = { command: cmd, output, exitCode: e.code ?? 1 };
      onOutput(result);
      results.push(result);
    }
  }

  return results;
}

// ── Auto test/build detection ───────────────────────────────────────────────

export type ProjectCommands = {
  /** The primary test command to run after file writes (e.g. "npm test") */
  test: string;
  /** Optional typecheck-only command (e.g. "npx tsc --noEmit") */
  typecheck?: string;
  /** Detected package manager (npm / yarn / pnpm / go / python / unknown) */
  packageManager: string;
};

/**
 * Detect the test and build commands for the current workspace.
 * Reads `package.json` scripts, falls back to go/python project heuristics.
 *
 * @param projectRoot - Absolute workspace root path
 * @returns Detected commands (or safe defaults if nothing can be detected)
 */
export async function detectProjectCommands(projectRoot: string | undefined): Promise<ProjectCommands> {
  if (!projectRoot) {
    return { test: "npm test", packageManager: "npm" };
  }

  // ── Node / npm ──────────────────────────────────────────────────────────
  try {
    const bytes = await vscode.workspace.fs.readFile(
      vscode.Uri.file(path.join(projectRoot, "package.json"))
    );
    const pkg = JSON.parse(bytes.toString()) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};

    // Detect package manager
    let pm = "npm";
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(path.join(projectRoot, "yarn.lock")));
      pm = "yarn";
    } catch { /* not yarn */ }
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(path.join(projectRoot, "pnpm-lock.yaml")));
      pm = "pnpm";
    } catch { /* not pnpm */ }

    const run = (name: string) => `${pm} ${pm === "npm" ? "run " : ""}${name}`;

    // Pick test command: prefer dedicated test:unit/test:run over watch modes
    const testScript =
      scripts["test:run"] ? run("test:run") :
      scripts["test:unit"] ? run("test:unit") :
      scripts["test"] && !scripts["test"].includes("watch") ? `${pm} test -- --passWithNoTests` :
      undefined;

    // Pick typecheck
    const typecheckScript =
      scripts["typecheck"] ? run("typecheck") :
      scripts["type-check"] ? run("type-check") :
      scripts["build"] && !scripts["build"].includes("watch") && !scripts["build"].includes("dev")
        ? run("build")
        : undefined;

    return {
      test: testScript ?? `${pm} test`,
      typecheck: typecheckScript,
      packageManager: pm
    };
  } catch { /* no package.json */ }

  // ── Go ─────────────────────────────────────────────────────────────────
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(path.join(projectRoot, "go.mod")));
    return { test: "go test ./...", typecheck: "go build ./...", packageManager: "go" };
  } catch { /* not go */ }

  // ── Python ─────────────────────────────────────────────────────────────
  for (const marker of ["pytest.ini", "pyproject.toml", "setup.py", "requirements.txt"]) {
    try {
      await vscode.workspace.fs.stat(vscode.Uri.file(path.join(projectRoot, marker)));
      return { test: "python -m pytest --tb=short -q", packageManager: "python" };
    } catch { /* not python */ }
  }

  // ── Rust ────────────────────────────────────────────────────────────────
  try {
    await vscode.workspace.fs.stat(vscode.Uri.file(path.join(projectRoot, "Cargo.toml")));
    return { test: "cargo test", typecheck: "cargo check", packageManager: "cargo" };
  } catch { /* not rust */ }

  return { test: "npm test", packageManager: "unknown" };
}
