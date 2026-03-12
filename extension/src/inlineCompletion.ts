import * as vscode from "vscode";
import { chatCompletion } from "./services/proxyClient";
import { updateAfterRequest } from "./statusBar";

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let lastRequestId = 0;

export function registerInlineCompletionProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.InlineCompletionItemProvider = {
    async provideInlineCompletionItems(
      document: vscode.TextDocument,
      position: vscode.Position,
      _context: vscode.InlineCompletionContext,
      token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | undefined> {
      const config = vscode.workspace.getConfiguration("aiFirewall");
      if (!config.get<boolean>("inlineCompletions", true)) {
        return undefined;
      }

      const requestId = ++lastRequestId;

      await new Promise<void>((resolve) => {
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(resolve, config.get<number>("completionDelay", 300));
      });

      if (token.isCancellationRequested || requestId !== lastRequestId) {
        return undefined;
      }

      // Completions use a dedicated fast model to keep latency low.
      // Falls back to defaultModel only if completionModel is not set.
      const model = config.get<string>("completionModel", "").trim() ||
                     config.get<string>("defaultModel", "").trim() ||
                     "gpt-4o-mini";

      const prefix = document.getText(
        new vscode.Range(
          new vscode.Position(Math.max(0, position.line - 50), 0),
          position
        )
      );

      const suffix = document.getText(
        new vscode.Range(
          position,
          new vscode.Position(
            Math.min(document.lineCount - 1, position.line + 20),
            document.lineAt(Math.min(document.lineCount - 1, position.line + 20)).text.length
          )
        )
      );

      if (prefix.trim().length < 3) {
        return undefined;
      }

      const lang = document.languageId;
      const fileName = document.fileName.split(/[/\\]/).pop() ?? "";

      const prompt = buildCompletionPrompt(lang, fileName, prefix, suffix);

      try {
        const response = await chatCompletion(model, [
          { role: "system", content: "You are an expert code completion engine. Output ONLY the code that should be inserted at the cursor position. No explanations, no markdown fences, no comments about what you're doing. Just the raw code to insert." },
          { role: "user", content: prompt }
        ], [document.uri.fsPath]);

        if (token.isCancellationRequested || requestId !== lastRequestId) {
          return undefined;
        }

        const text = response.choices?.[0]?.message?.content;
        if (!text || text.trim().length === 0) {
          return undefined;
        }

        const cleaned = cleanCompletion(text, suffix);
        if (!cleaned) {
          return undefined;
        }

        if (response._firewall) {
          updateAfterRequest({
            action: response._firewall.action,
            model: response._firewall.model_used,
            tokensUsed: response._firewall.tokens_used,
            cost: response._firewall.cost_estimate
          });
        }

        return [
          new vscode.InlineCompletionItem(
            cleaned,
            new vscode.Range(position, position)
          )
        ];
      } catch {
        return undefined;
      }
    }
  };

  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      provider
    )
  );
}

function buildCompletionPrompt(
  lang: string,
  fileName: string,
  prefix: string,
  suffix: string
): string {
  const parts = [`Language: ${lang}`, `File: ${fileName}`];

  if (suffix.trim().length > 0) {
    parts.push(
      `Code before cursor:\n\`\`\`\n${prefix}\n\`\`\``,
      `Code after cursor:\n\`\`\`\n${suffix}\n\`\`\``,
      "Complete the code at the cursor position. Fill in what goes between the before and after sections."
    );
  } else {
    parts.push(
      `Code before cursor:\n\`\`\`\n${prefix}\n\`\`\``,
      "Continue writing the code from where it left off."
    );
  }

  return parts.join("\n\n");
}

function cleanCompletion(raw: string, suffix: string): string | undefined {
  let text = raw;

  const fenceMatch = text.match(/^```[\w]*\n([\s\S]*?)```\s*$/);
  if (fenceMatch) {
    text = fenceMatch[1];
  }

  text = text.replace(/^```[\w]*\n?/, "").replace(/\n?```\s*$/, "");
  text = text.replace(/^\n+/, "");

  if (text.trim().length === 0) {
    return undefined;
  }

  const lines = text.split("\n");
  if (lines.length > 30) {
    text = lines.slice(0, 30).join("\n");
  }

  // Strip trailing brackets/braces/parens that duplicate what already exists at the start of `suffix`
  text = stripDuplicateSuffix(text, suffix);

  return text || undefined;
}

/**
 * If the LLM's completion ends with closing brackets that already exist at the
 * beginning of the code after the cursor, strip them to avoid duplicate syntax.
 * e.g. completion ends with "  }\n}" but suffix starts with "\n}" — remove the last "}"
 */
function stripDuplicateSuffix(completion: string, suffix: string): string {
  const CLOSERS = /^[\s\}\)\];,]+/;
  const suffixTrimmed = suffix.trimStart();
  const suffixOpeners = (suffixTrimmed.match(CLOSERS) ?? [""])[0].replace(/\s/g, "");
  if (!suffixOpeners) return completion;

  let result = completion;
  // Walk backwards: if completion ends with a char that suffix starts with, strip it
  for (const ch of suffixOpeners.split("").reverse()) {
    const trimmed = result.trimEnd();
    if (trimmed.endsWith(ch)) {
      // Remove the last occurrence of ch and any trailing whitespace before it
      const idx = result.lastIndexOf(ch);
      result = result.slice(0, idx) + result.slice(idx + 1);
    }
  }
  return result;
}
