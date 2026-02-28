import { createConnection, TextDocuments, ProposedFeatures, InitializeParams, InitializeResult } from "vscode-languageserver/node";
import fetch from "node-fetch";

const connection = createConnection(ProposedFeatures.all);
const documents: TextDocuments = new TextDocuments();

connection.onInitialize((_params: InitializeParams) => {
  const result: InitializeResult = { capabilities: { completionProvider: { resolveProvider: false } } };
  return result;
});

connection.onCompletion(async (textDocumentPosition) => {
  // Simple shim: call local proxy /api/estimate or /v1/chat/completions for suggestions
  // For now return static item
  return [{ label: "aiFirewallSuggestion", kind: 1 }];
});

documents.listen(connection);
connection.listen();

