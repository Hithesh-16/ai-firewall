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

      const model = config.get<string>("completionModel", "") ||
                     config.get<string>("defaultModel", "gpt-4");

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

        const cleaned = cleanCompletion(text);
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

function cleanCompletion(raw: string): string | undefined {
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

  return text;
}
