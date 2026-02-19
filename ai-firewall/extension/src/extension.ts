import * as vscode from "vscode";
import { registerCodeActionProvider } from "./codeActions";
import { registerCodeLensProvider } from "./codeLens";
import { registerCommands } from "./commands";
import { registerInlineChat } from "./inlineChat";
import { registerInlineCompletionProvider } from "./inlineCompletion";
import { createStatusBar, disposeStatusBar } from "./statusBar";
import { ChatViewProvider } from "./views/chatViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const chatProvider = new ChatViewProvider(context.extensionUri);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      ChatViewProvider.viewType,
      chatProvider,
      { webviewOptions: { retainContextWhenHidden: true } }
    )
  );

  const statusBar = createStatusBar();
  context.subscriptions.push(statusBar);

  registerCommands(context, chatProvider.postToWebview);
  registerInlineCompletionProvider(context);
  registerInlineChat(context);
  registerCodeActionProvider(context);
  registerCodeLensProvider(context);
}

export function deactivate(): void {
  disposeStatusBar();
}
