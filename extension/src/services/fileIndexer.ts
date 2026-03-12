import * as path from "path";
import * as vscode from "vscode";

// Directories that are never useful as LLM context
const EXCLUDE_DIR_NAMES = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt", "coverage",
  ".cache", "__pycache__", "vendor", "target", ".gradle", ".mvn", "bin", "obj",
  ".pytest_cache", ".mypy_cache", ".turbo", ".parcel-cache", "storybook-static",
  ".expo", "android", "ios", ".idea", ".vscode"
]);

// File extensions that are binary / non-text / minified
const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico", ".bmp", ".webp",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".mp3", ".mp4", ".wav", ".avi", ".mov", ".ogg", ".flac",
  ".zip", ".tar", ".gz", ".bz2", ".7z", ".rar",
  ".jar", ".war", ".ear", ".class", ".pyc", ".pyo",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".sqlite", ".db", ".sqlite3",
  ".map"
]);

// Minified / lock-file extensions — readable but not useful context
const SKIP_EXTENSIONS = new Set([
  ".lock", ".min.js", ".min.css"
]);

const SKIP_FILENAMES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
  "Pipfile.lock", "poetry.lock", "composer.lock",
  "go.sum", "Gemfile.lock", "shrinkwrap.json"
]);

export function isBinaryPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

export function isSkippedPath(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const base = path.basename(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;
  if (SKIP_EXTENSIONS.has(ext)) return true;
  if (SKIP_FILENAMES.has(base)) return true;
  // Check for .min.js / .min.css style names
  if (base.includes(".min.")) return true;
  return false;
}

function isExcludedDir(filePath: string): boolean {
  const parts = filePath.split(/[/\\]/);
  return parts.some((p) => EXCLUDE_DIR_NAMES.has(p));
}

export class FileIndexer implements vscode.Disposable {
  private _files: string[] = [];
  private _watcher?: vscode.FileSystemWatcher;
  private _rebuildTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this._init();
  }

  private _init(): void {
    if (!vscode.workspace.workspaceFolders?.length) return;

    this._buildIndex();

    // Watch only create/delete events — update events don't change the path list
    this._watcher = vscode.workspace.createFileSystemWatcher(
      "**/*",
      false, // onCreate
      true,  // onChange — ignore
      false  // onDelete
    );
    this._watcher.onDidCreate(() => this._scheduleRebuild());
    this._watcher.onDidDelete(() => this._scheduleRebuild());
  }

  private _scheduleRebuild(): void {
    if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
    this._rebuildTimer = setTimeout(() => this._buildIndex(), 2000);
  }

  private async _buildIndex(): Promise<void> {
    try {
      const excludeGlob = `{${[...EXCLUDE_DIR_NAMES].map((d) => `**/${d}/**`).join(",")}}`;
      const uris = await vscode.workspace.findFiles("**/*", excludeGlob, 10_000);
      this._files = uris
        .map((u) => vscode.workspace.asRelativePath(u, false))
        .filter((p) => !isExcludedDir(p) && !isSkippedPath(p))
        .sort();
    } catch {
      this._files = [];
    }
  }

  /** All indexed relative paths */
  public getFiles(): string[] {
    return this._files;
  }

  /**
   * Fuzzy search: returns up to `maxResults` paths matching `query`.
   * Priority: basename exact-contains > full-path-contains > character-sequence.
   */
  public search(query: string, maxResults = 25): string[] {
    if (!query) return this._files.slice(0, maxResults);

    const lower = query.toLowerCase();

    type Scored = { path: string; score: number };
    const scored: Scored[] = [];

    for (const f of this._files) {
      const base = path.basename(f).toLowerCase();
      const full = f.toLowerCase();

      if (base === lower) {
        scored.push({ path: f, score: 100 });
      } else if (base.startsWith(lower)) {
        scored.push({ path: f, score: 90 });
      } else if (base.includes(lower)) {
        scored.push({ path: f, score: 80 });
      } else if (full.includes(lower)) {
        scored.push({ path: f, score: 70 });
      } else if (this._fuzzyMatch(lower, full)) {
        scored.push({ path: f, score: 60 });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, maxResults)
      .map((s) => s.path);
  }

  /** Checks each char of `pattern` appears in `str` in order */
  private _fuzzyMatch(pattern: string, str: string): boolean {
    let pi = 0;
    for (let si = 0; si < str.length && pi < pattern.length; si++) {
      if (str[si] === pattern[pi]) pi++;
    }
    return pi === pattern.length;
  }

  public dispose(): void {
    this._watcher?.dispose();
    if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
  }
}
