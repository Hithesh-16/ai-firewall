/**
 * agentParser.ts — Parse agentic XML tags from LLM responses.
 *
 * The LLM uses structured XML tags to signal file and command operations:
 *   <create_file path="...">content</create_file>
 *   <edit_file path="...">content</edit_file>
 *   <run_command>shell command</run_command>
 *
 * This module provides pure parsing functions with no VS Code dependency.
 */

export type FileOp = {
  type: "create" | "edit";
  path: string;
  content: string;
};

/**
 * Parse all `<create_file>` and `<edit_file>` tags from LLM response text.
 *
 * @param content - The full LLM response string
 * @returns Ordered list of file operations
 */
export function parseFileOperations(content: string): FileOp[] {
  const ops: FileOp[] = [];

  const createRegex = /<create_file\s+path="([^"]+)">([\s\S]*?)<\/create_file>/g;
  const editRegex   = /<edit_file\s+path="([^"]+)">([\s\S]*?)<\/edit_file>/g;

  let m: RegExpExecArray | null;
  while ((m = createRegex.exec(content)) !== null) {
    ops.push({ type: "create", path: m[1].trim(), content: m[2] });
  }
  while ((m = editRegex.exec(content)) !== null) {
    ops.push({ type: "edit", path: m[1].trim(), content: m[2] });
  }

  return ops;
}

/**
 * Parse all `<run_command>` tags from LLM response text.
 *
 * @param content - The full LLM response string
 * @returns List of shell command strings to execute
 */
export function parseRunCommands(content: string): string[] {
  const commands: string[] = [];
  const regex = /<run_command>([\s\S]*?)<\/run_command>/g;

  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    const cmd = m[1].trim();
    if (cmd) commands.push(cmd);
  }

  return commands;
}
