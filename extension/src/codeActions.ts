import * as vscode from "vscode";

export function registerCodeActionProvider(
  context: vscode.ExtensionContext
): void {
  const provider: vscode.CodeActionProvider = {
    provideCodeActions(
      document: vscode.TextDocument,
      range: vscode.Range | vscode.Selection,
      _context: vscode.CodeActionContext,
      _token: vscode.CancellationToken
    ): vscode.CodeAction[] | undefined {
      if (range.isEmpty) {
        return undefined;
      }

      const actions: vscode.CodeAction[] = [];

      const editAction = new vscode.CodeAction(
        "AI Firewall: Edit with AI",
        vscode.CodeActionKind.RefactorRewrite
      );
      editAction.command = {
        command: "aiFirewall.inlineChat",
        title: "Edit with AI"
      };
      actions.push(editAction);

      const explainAction = new vscode.CodeAction(
        "AI Firewall: Explain",
        vscode.CodeActionKind.Empty
      );
      explainAction.command = {
        command: "aiFirewall.explainCode",
        title: "Explain Code"
      };
      actions.push(explainAction);

      const docAction = new vscode.CodeAction(
        "AI Firewall: Add Docs",
        vscode.CodeActionKind.RefactorRewrite
      );
      docAction.command = {
        command: "aiFirewall.documentCode",
        title: "Add Documentation"
      };
      actions.push(docAction);

      const refactorAction = new vscode.CodeAction(
        "AI Firewall: Refactor",
        vscode.CodeActionKind.RefactorRewrite
      );
      refactorAction.command = {
        command: "aiFirewall.refactorCode",
        title: "Refactor Code"
      };
      actions.push(refactorAction);

      const fixAction = new vscode.CodeAction(
        "AI Firewall: Fix This",
        vscode.CodeActionKind.QuickFix
      );
      fixAction.command = {
        command: "aiFirewall.fixCode",
        title: "Fix Code"
      };
      actions.push(fixAction);

      const testAction = new vscode.CodeAction(
        "AI Firewall: Generate Tests",
        vscode.CodeActionKind.Empty
      );
      testAction.command = {
        command: "aiFirewall.generateTests",
        title: "Generate Tests"
      };
      actions.push(testAction);

      return actions;
    }
  };

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { pattern: "**" },
      provider,
      {
        providedCodeActionKinds: [
          vscode.CodeActionKind.RefactorRewrite,
          vscode.CodeActionKind.QuickFix,
          vscode.CodeActionKind.Empty
        ]
      }
    )
  );
}
