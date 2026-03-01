import fs from "node:fs";
import path from "node:path";
import picomatch from "picomatch";
import { FileScopeConfig, FileScopeResult } from "../types";

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

function toRelativePath(filePath: string): string {
  const absolutePath = path.resolve(filePath);
  const cwd = process.cwd();
  if (absolutePath.startsWith(cwd)) {
    return normalizePath(path.relative(cwd, absolutePath));
  }
  return normalizePath(filePath);
}

function matchesAny(targetPath: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  return patterns.some((pattern) => picomatch(pattern, { dot: true })(targetPath));
}

export function checkFileScope(filePath: string, config: FileScopeConfig): FileScopeResult {
  const relativePath = toRelativePath(filePath);

  if (config.mode === "allowlist") {
    const allowed = matchesAny(relativePath, config.allowlist);
    return {
      allowed,
      path: relativePath,
      reason: allowed ? undefined : `Path not in allowlist: ${relativePath}`
    };
  }

  const blocked = matchesAny(relativePath, config.blocklist);
  return {
    allowed: !blocked,
    path: relativePath,
    reason: blocked ? `Path in blocklist: ${relativePath}` : undefined
  };
}

export function validateFilePaths(filePaths: string[] | undefined, config: FileScopeConfig): FileScopeResult[] {
  if (!filePaths || filePaths.length === 0) return [];

  const results: FileScopeResult[] = [];
  for (const filePath of filePaths) {
    const scopeResult = checkFileScope(filePath, config);

    if (scopeResult.allowed) {
      const absolutePath = path.resolve(filePath);
      try {
        const stats = fs.statSync(absolutePath);
        if (stats.size > config.max_file_size_kb * 1024) {
          results.push({
            allowed: false,
            path: scopeResult.path,
            reason: `File exceeds max size (${config.max_file_size_kb}KB): ${scopeResult.path}`
          });
          continue;
        }
      } catch {
        results.push({
          allowed: false,
          path: scopeResult.path,
          reason: `File not accessible: ${scopeResult.path}`
        });
        continue;
      }
    }

    results.push(scopeResult);
  }

  return results;
}
