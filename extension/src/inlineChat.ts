import * as vscode from "vscode";
import { chatCompletion } from "./services/proxyClient";
import { updateAfterRequest } from "./statusBar";

export function registerInlineChat(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("aiFirewall.inlineChat", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);
      const hasSelection = !selection.isEmpty;

      const instruction = await vscode.window.showInputBox({
        prompt: hasSelection
          ? "How should this code be changed?"
          : "What code should be generated here?",
        placeHolder: hasSelection
          ? "e.g. Add error handling, optimize, convert to async..."
          : "e.g. Write a function that sorts by date...",
        ignoreFocusOut: true
      });

      if (!instruction) {
        return;
      }

      const config = vscode.workspace.getConfiguration("aiFirewall");
      const model =
        config.get<string>("completionModel", "") ||
        config.get<string>("defaultModel", "gpt-4");
      const lang = editor.document.languageId;
      const filePath = editor.document.uri.fsPath;

      let prompt: string;
      if (hasSelection) {
        prompt = [
          `Language: ${lang}`,
          `File: ${filePath}`,
          `Instruction: ${instruction}`,
          "",
          "Original code:",
          "```",
          selectedText,
          "```",
          "",
          "Output ONLY the replacement code. No explanations, no markdown fences."
        ].join("\n");
      } else {
        const beforeCursor = editor.document.getText(
          new vscode.Range(
            new vscode.Position(Math.max(0, selection.start.line - 10), 0),
            selection.start
          )
        );
        prompt = [
          `Language: ${lang}`,
          `File: ${filePath}`,
          `Instruction: ${instruction}`,
          "",
          "Context (code before cursor):",
          "```",
          beforeCursor,
          "```",
          "",
          "Generate the code to insert. Output ONLY the raw code. No explanations, no markdown fences."
        ].join("\n");
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "AI Firewall: Generating...",
          cancellable: true
        },
        async (_progress, token) => {
          try {
            const response = await chatCompletion(
              model,
              [
                {
                  role: "system",
                  content:
                    "You are an expert code editor. Output ONLY the code. No markdown, no explanations, no code fences."
                },
                { role: "user", content: prompt }
              ],
              [filePath]
            );

            if (token.isCancellationRequested) {
              return;
            }

            const rawOutput = response.choices?.[0]?.message?.content ?? "";
            const newCode = stripFences(rawOutput);

            if (!newCode.trim()) {
              vscode.window.showInformationMessage(
                "AI Firewall: No code was generated."
              );
              return;
            }

            if (response._firewall) {
              updateAfterRequest({
                action: response._firewall.action,
                model: response._firewall.model_used,
                tokensUsed: response._firewall.tokens_used,
                cost: response._firewall.cost_estimate
              });
            }

            await showDiffAndApply(editor, selection, selectedText, newCode, hasSelection);
          } catch (err) {
            vscode.window.showErrorMessage(
              `AI Firewall: ${err instanceof Error ? err.message : "Generation failed"}`
            );
          }
        }
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("aiFirewall.inlineEdit", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.selection.isEmpty) {
        vscode.window.showWarningMessage(
          "Select some code first, then use Inline Edit."
        );
        return;
      }
      await vscode.commands.executeCommand("aiFirewall.inlineChat");
    })
  );
}

async function showDiffAndApply(
  editor: vscode.TextEditor,
  selection: vscode.Selection,
  originalText: string,
  newCode: string,
  isReplace: boolean
): Promise<void> {
  const targetRange = isReplace
    ? selection
    : new vscode.Range(selection.start, selection.start);

  const label = isReplace ? "Replace" : "Insert";

  const choice = await vscode.window.showInformationMessage(
    `AI Firewall: ${label} ${newCode.split("\n").length} lines of code?`,
    { modal: false },
    "Apply",
    "Apply & Format",
    "Copy to Clipboard",
    "Discard"
  );

  switch (choice) {
    case "Apply":
      await editor.edit((editBuilder) => {
        if (isReplace) {
          editBuilder.replace(targetRange, newCode);
        } else {
          editBuilder.insert(targetRange.start, newCode);
        }
      });
      break;

    case "Apply & Format":
      await editor.edit((editBuilder) => {
        if (isReplace) {
          editBuilder.replace(targetRange, newCode);
        } else {
          editBuilder.insert(targetRange.start, newCode);
        }
      });
      await vscode.commands.executeCommand(
        "editor.action.formatDocument"
      );
      break;

    case "Copy to Clipboard":
      await vscode.env.clipboard.writeText(newCode);
      vscode.window.showInformationMessage("Code copied to clipboard.");
      break;

    case "Discard":
    default:
      break;
  }
}

function stripFences(raw: string): string {
  let text = raw;
  const fenceMatch = text.match(/^```[\w]*\n([\s\S]*?)```\s*$/);
  if (fenceMatch) {
    text = fenceMatch[1];
  }
  text = text.replace(/^```[\w]*\n?/, "").replace(/\n?```\s*$/, "");
  return text;
}
