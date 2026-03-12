declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface VsMessage {
  type: string;
  [key: string]: unknown;
}

import { marked } from "marked";
const vscode = acquireVsCodeApi();

// ── State ──────────────────────────────────────────────────────────────

type ChatMsg = { role: string; content: string };
type Provider = { id: number; name: string; slug: string; baseUrl: string; enabled: boolean };
type Model = { id: number; providerId: number; modelName: string; displayName: string; inputCostPer1k: number; outputCostPer1k: number; maxContextTokens?: number; enabled: boolean; registered?: boolean };
type Credit = { id: number; providerId: number | null; limitType: string; totalLimit: number; usedAmount: number; resetPeriod: string; resetDate: number; hardLimit: boolean };
type FileOp = { type: "create" | "edit"; path: string; content: string };
type EstResult = {
  estimatedInputTokens: number;
  estimatedCost: number;
  creditRemaining: number;
  creditLimitType: string;
  scan: { action: string; secretsFound: number; piiFound: number; filesBlocked: string[]; riskScore: number; reasons: string[]; sensitiveFiles?: string[]; findingTypes?: string[] };
  model: { name: string; displayName: string; provider: string; registered: boolean };
  modelPolicyBlocked?: { blockedFiles: string[] };
};
type UsageSummary = { totalRequests: number; totalTokens: number; totalCost: number; byModel: Array<{ modelName: string; requests: number; tokens: number; cost: number }> };

let currentTab = "chat";
let connected = false;
let authed = false;
let authUser: any | null = null;
let chatHistory: ChatMsg[] = [];
let selectedModel = "";
let configuredDefaultModel = "";
let providers: Provider[] = [];
let models: Model[] = [];
let credits: Credit[] = [];
let usage: UsageSummary = { totalRequests: 0, totalTokens: 0, totalCost: 0, byModel: [] };
let pendingEstimate: EstResult | null = null;
let pendingMessages: ChatMsg[] = [];
let pendingFilePaths: string[] = [];
let pendingBypassedPaths: string[] = [];
let isLoading = false;
let showPreFlight = true;
let toastMsg = "";
let toastTimer: ReturnType<typeof setTimeout> | undefined;

// @ mention state
let mentionedFiles: string[] = [];
let mentionDropdownVisible = false;
let mentionDropdownQuery = "";
let mentionDropdownResults: string[] = [];
let mentionDropdownIdx = 0;
let mentionAtStart = -1; // cursor position where @ was typed

// Agent mode (plan / create / edit)
let agentMode = false;

// Pending file operations from LLM
let pendingFileOps: FileOp[] = [];

// ── Rendering ──────────────────────────────────────────────────────────

function render(): void {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    ${renderConnectionBar()}
    ${authed ? `
      <div class="tabs">
        ${renderTab("chat", "Chat")}
        ${renderTab("providers", "Providers")}
        ${renderTab("models", "Models")}
        ${renderTab("credits", "Credits")}
        ${renderTab("activity", "Activity")}
      </div>
      <div class="panel ${currentTab === "chat" ? "active" : ""}" id="panel-chat">
        ${renderChat()}
      </div>
      <div class="panel ${currentTab === "providers" ? "active" : ""}" id="panel-providers">
        ${renderProviders()}
      </div>
      <div class="panel ${currentTab === "models" ? "active" : ""}" id="panel-models">
        ${renderModels()}
      </div>
      <div class="panel ${currentTab === "credits" ? "active" : ""}" id="panel-credits">
        ${renderCredits()}
      </div>
      <div class="panel ${currentTab === "activity" ? "active" : ""}" id="panel-activity">
        ${renderActivity()}
      </div>
    ` : `
      <div class="panel active" id="panel-login">
        ${renderLogin()}
      </div>
    `}
    ${toastMsg ? `<div class="toast">${esc(toastMsg)}</div>` : ""}
  `;
  bindEvents();
}

function renderConnectionBar(): string {
  if (connected) {
    const who = authed && authUser?.email ? ` — ${esc(String(authUser.email))}` : "";
    return `<div class="connection-bar ok">Connected to AI Firewall proxy${who}</div>`;
  }
  return `<div class="connection-bar err">Cannot reach proxy — start the server</div>`;
}

function renderLogin(): string {
  return `
    <div class="section-title">Login required</div>
    <div class="empty-state" style="padding:12px 0;text-align:left">
      Sign in to configure providers/models and send requests.
    </div>
    <div class="form-group"><label>Email</label><input type="text" id="login-email" placeholder="you@company.com" /></div>
    <div class="form-group"><label>Password</label><input type="password" id="login-password" placeholder="********" /></div>
    <div style="display:flex;gap:6px">
      <button type="button" class="btn btn-primary" id="login-btn">Login</button>
      <button type="button" class="btn btn-secondary" id="register-btn">Register</button>
    </div>
    <div class="empty-state" style="padding:12px 0;text-align:left">
      If you already have a token, set <b>AI Firewall: Api Token</b> in VS Code settings.
    </div>
  `;
}

function renderTab(id: string, label: string): string {
  return `<button type="button" class="tab ${currentTab === id ? "active" : ""}" data-tab="${id}">${label}</button>`;
}

// ── Chat ────────────────────────────────────────────────────────────────

function renderChat(): string {
  const enabledModels = models.filter((m) => m.enabled && (m.registered !== false));

  // Build model options with context window hint and overflow warning
  const ctxTokens = currentContextTokens();
  const modelOpts = enabledModels
    .map((m) => {
      const ctxLimit = m.maxContextTokens ?? 0;
      const overflows = ctxLimit > 0 && ctxTokens > ctxLimit;
      const ctxHint = ctxLimit > 0 ? ` (${Math.round(ctxLimit / 1000)}k ctx)` : "";
      const label = esc(m.displayName || m.modelName) + ctxHint + (overflows ? " ⚠" : "");
      return `<option value="${esc(m.modelName)}" ${m.modelName === selectedModel ? "selected" : ""}>${label}</option>`;
    })
    .join("");

  const noModelsOpt =
    enabledModels.length === 0
      ? '<option value="" disabled>— Add models in the Models tab —</option>'
      : "";

  // Context window overflow warning for selected model
  const selInfo = selectedModelInfo();
  const ctxLimit = selInfo?.maxContextTokens ?? 0;
  const ctxOverflow = ctxLimit > 0 && ctxTokens > ctxLimit;
  const ctxBar = ctxTokens > 0
    ? `<span style="font-size:10px;color:${ctxOverflow ? "var(--error)" : "var(--subtle)"};margin-left:6px" title="Estimated tokens in current conversation">~${ctxTokens.toLocaleString()} tok${ctxOverflow ? ` — exceeds ${Math.round(ctxLimit / 1000)}k limit` : ""}</span>`
    : "";

  let msgs = chatHistory.map((m) => {
    if (m.role === "assistant") {
      return `<div class="msg assistant"><div class="markdown-preview">${renderAssistantContent(m.content)}</div></div>`;
    }
    return `<div class="msg ${m.role}">${esc(m.content)}</div>`;
  }).join("");
  if (isLoading) {
    msgs += `<div class="msg system"><span class="spinner"></span> Waiting for response...</div>`;
  }

  const preflightHtml = pendingEstimate ? renderPreFlight(pendingEstimate) : "";

  // Context overflow blocks send
  const canSend = enabledModels.length > 0
    && (selectedModel === "" || enabledModels.some((m) => m.modelName === selectedModel))
    && !ctxOverflow;

  const attachedCount = pendingFilePaths.length + pendingBypassedPaths.length;
  const attachLabel = attachedCount > 0 ? `Attach (${attachedCount})` : "Attach";

  // @ mention chips
  const mentionChips = mentionedFiles.length > 0
    ? `<div class="mention-chips" id="mention-chips">${mentionedFiles.map((f, i) =>
        `<span class="mention-chip" data-idx="${i}">@${esc(f)}<button class="mention-chip-x" data-idx="${i}" title="Remove">×</button></span>`
      ).join("")}</div>`
    : "";

  // @ mention dropdown
  const dropdownHtml = mentionDropdownVisible && mentionDropdownResults.length > 0
    ? `<div class="mention-dropdown" id="mention-dropdown">${
        mentionDropdownResults.map((f, i) =>
          `<div class="mention-option ${i === mentionDropdownIdx ? "selected" : ""}" data-idx="${i}" data-path="${esc(f)}">${esc(f)}</div>`
        ).join("")
      }</div>`
    : "";

  // Pending file operations diff modal
  const diffModal = pendingFileOps.length > 0 ? renderDiffModal(pendingFileOps) : "";

  return `
    <div class="model-selector">
      <label style="font-size:11px;color:var(--subtle)">Model:</label>
      <select id="model-select">${noModelsOpt}${modelOpts}</select>
      ${ctxBar}
      <label style="font-size:10px;color:var(--subtle);margin-left:auto;display:flex;align-items:center;gap:3px;cursor:pointer" title="Agent mode: LLM can create and edit files">
        <input type="checkbox" id="agent-mode-toggle" ${agentMode ? "checked" : ""} style="cursor:pointer"> Agent
      </label>
      <button type="button" class="btn btn-secondary btn-sm" id="attach-files-btn" title="Attach specific files">${esc(attachLabel)}</button>
    </div>
    ${ctxOverflow ? `<div style="font-size:11px;color:var(--error);padding:4px 8px;background:rgba(255,0,0,.08);border-radius:4px;margin-bottom:4px">Context too large for <b>${esc(selInfo?.displayName ?? selectedModel)}</b>. Clear chat or switch to a model with a larger context window.</div>` : ""}
    <div class="chat-messages" id="chat-messages">${msgs || '<div class="empty-state">Start a conversation with AI.<br/>Type <b>@</b> to attach files. Enable <b>Agent</b> mode to let the AI create and edit files.</div>'}</div>
    ${preflightHtml}
    ${diffModal}
    <div style="position:relative">
      ${mentionChips}
      ${dropdownHtml}
      <div class="chat-input-row">
        <textarea class="chat-input" id="chat-input" placeholder="Type your message… or @ to mention a file" rows="1"></textarea>
        <button type="button" class="btn btn-primary" id="send-btn" ${isLoading || !canSend ? "disabled" : ""}>Send</button>
      </div>
    </div>
  `;
}

function renderDiffModal(ops: FileOp[]): string {
  const items = ops.map((op, i) => `
    <div class="diff-item" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
        <span class="pf-badge ${op.type === "create" ? "allow" : "redact"}" style="font-size:10px">${op.type.toUpperCase()}</span>
        <code style="font-size:11px">${esc(op.path)}</code>
      </div>
      <pre style="font-size:10px;max-height:160px;overflow:auto;background:var(--input-bg);border:1px solid var(--border);border-radius:4px;padding:6px;margin:0">${esc(op.content.slice(0, 2000))}${op.content.length > 2000 ? "\n… (truncated)" : ""}</pre>
      <div style="margin-top:4px;display:flex;gap:4px">
        <button type="button" class="btn btn-primary btn-sm diff-accept" data-idx="${i}">Accept</button>
        <button type="button" class="btn btn-secondary btn-sm diff-reject" data-idx="${i}">Reject</button>
      </div>
    </div>
  `).join("");

  return `
    <div class="preflight-card" id="diff-modal">
      <div style="font-weight:600;margin-bottom:8px">Agent wants to make ${ops.length} file change${ops.length > 1 ? "s" : ""}</div>
      ${items}
      <button type="button" class="btn btn-secondary btn-sm" id="diff-dismiss-all" style="margin-top:4px">Dismiss all</button>
    </div>
  `;
}

function renderPreFlight(est: EstResult): string {
  const actionClass = est.scan.action.toLowerCase();
  const creditStr = est.creditRemaining === -1 ? "unlimited" : est.creditRemaining.toLocaleString();

  // Make "Send" act like send: if it's clean ALLOW, we auto-send and just show a tiny badge.
  if (est.scan.action === "ALLOW" && est.scan.secretsFound === 0 && est.scan.piiFound === 0 && (est.scan.filesBlocked?.length ?? 0) === 0) {
    // Clear preflight UI immediately; extension will send chat right after.
    setTimeout(() => confirmSend(), 0);
    return `
      <div class="preflight-card">
        <div class="pf-row"><span class="pf-label">Pre-flight</span><span class="pf-badge allow">ALLOW</span></div>
      </div>
    `;
  }

  return `
    <div class="preflight-card">
      <div style="font-weight:600;margin-bottom:6px">Pre-flight Check</div>
      <div class="pf-row"><span class="pf-label">Model</span><span>${esc(est.model.displayName)} (${esc(est.model.provider)})</span></div>
      <div class="pf-row"><span class="pf-label">Est. tokens</span><span>~${est.estimatedInputTokens.toLocaleString()}</span></div>
      <div class="pf-row"><span class="pf-label">Est. cost</span><span>$${est.estimatedCost.toFixed(6)}</span></div>
      <div class="pf-row"><span class="pf-label">Credits left</span><span>${creditStr} ${est.creditLimitType !== "none" ? est.creditLimitType : ""}</span></div>
      <div class="pf-row"><span class="pf-label">Scan</span><span class="pf-badge ${actionClass}">${est.scan.action}</span></div>
      ${est.scan.secretsFound > 0 ? `<div class="pf-row"><span class="pf-label">Secrets</span><span style="color:var(--warning)">${est.scan.secretsFound} found (will be redacted)</span></div>` : ""}
      ${est.scan.piiFound > 0 ? `<div class="pf-row"><span class="pf-label">PII</span><span style="color:var(--warning)">${est.scan.piiFound} found</span></div>` : ""}
      ${est.scan.riskScore > 0 ? `<div class="pf-row"><span class="pf-label">Risk score</span><span>${est.scan.riskScore}/100</span></div>` : ""}
      ${(est.modelPolicyBlocked?.blockedFiles?.length ?? 0) > 0 ? `<div class="pf-row"><span class="pf-label">Files excluded</span><span style="color:var(--subtle);font-size:11px">${esc(est.modelPolicyBlocked!.blockedFiles.slice(0, 5).join(", "))}${est.modelPolicyBlocked!.blockedFiles.length > 5 ? "…" : ""} (by policy, request will use remaining files)</span></div>` : ""}
      ${(est.scan.sensitiveFiles?.length ?? 0) > 0 ? `<div class="pf-row"><span class="pf-label">Files at risk</span><span style="color:var(--warning);font-size:11px">${esc(est.scan.sensitiveFiles.slice(0, 8).join(", "))}${(est.scan.sensitiveFiles?.length ?? 0) > 8 ? "…" : ""}</span></div>` : ""}
      ${(est.scan.findingTypes?.length ?? 0) > 0 ? `<div class="pf-row"><span class="pf-label">Finding types</span><span style="font-size:11px">${esc(est.scan.findingTypes.join(", "))}</span></div>` : ""}
      ${est.scan.action === "BLOCK" ? `<div style="color:var(--error);margin-top:6px;font-size:11px">${esc(est.scan.reasons.join(". "))}</div>` : ""}
      <div class="pf-actions">
        ${est.scan.action !== "BLOCK" ? `<button type="button" class="btn btn-primary btn-sm" id="pf-confirm">Send</button>` : ""}
        <button type="button" class="btn btn-secondary btn-sm" id="pf-cancel">Cancel</button>
      </div>
    </div>
  `;
}

// ── Providers ───────────────────────────────────────────────────────────

function renderProviders(): string {
  const list = providers.map((p) => `
    <div class="card">
      <div class="card-header">
        <span class="card-title">${esc(p.name)}</span>
        <span style="font-size:10px;color:${p.enabled ? "var(--success)" : "var(--error)"}">${p.enabled ? "enabled" : "disabled"}</span>
      </div>
      <div style="font-size:11px;color:var(--subtle)">${esc(p.baseUrl)}</div>
      <div style="margin-top:6px;display:flex;gap:4px">
        <button type="button" class="btn btn-secondary btn-sm toggle-provider" data-id="${p.id}" data-enabled="${p.enabled ? "1" : "0"}">${p.enabled ? "Disable" : "Enable"}</button>
        <button type="button" class="btn btn-danger btn-sm delete-provider" data-id="${p.id}">Delete</button>
      </div>
    </div>
  `).join("");

  const presets = [
    { name: "Groq (Llama free)", baseUrl: "https://api.groq.com/openai/v1", hint: "Get free API key at console.groq.com" },
    { name: "OpenAI", baseUrl: "https://api.openai.com/v1", hint: "GPT-4, GPT-3.5" },
    { name: "Anthropic", baseUrl: "https://api.anthropic.com", hint: "Claude" },
    { name: "x.ai (Grok)", baseUrl: "https://api.x.ai/v1", hint: "Grok models" }
  ];
  const presetBtns = presets.map((pre) =>
    `<button type="button" class="btn btn-secondary btn-sm preset-provider" data-name="${esc(pre.name)}" data-url="${esc(pre.baseUrl)}" title="${esc(pre.hint)}">${esc(pre.name)}</button>`
  ).join(" ");

  return `
    <div class="section-title">Your Providers</div>
    ${list || '<div class="empty-state">No providers configured yet.<br/>Use a preset below or add manually.</div>'}
    <div style="display:flex;justify-content:flex-end;margin:6px 0 2px 0">
      <button type="button" class="btn btn-secondary btn-sm" id="configure-restrictions-btn">Restrict files/folders</button>
    </div>
    <div class="section-title">Quick add (preset)</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">${presetBtns}</div>
    <div class="section-title">Add Provider</div>
    <div class="form-group"><label>Name</label><input type="text" id="prov-name" placeholder="e.g. Groq, OpenAI" /></div>
    <div class="form-group"><label>Base URL</label><input type="url" id="prov-url" placeholder="https://api.groq.com/openai/v1" /></div>
    <div class="form-group"><label>API Key</label><input type="password" id="prov-key" placeholder="Paste your API key" /></div>
    <button type="button" class="btn btn-primary" id="add-provider-btn">Add Provider</button>
    <p style="font-size:10px;color:var(--subtle);margin-top:8px">Groq: free Llama at <a href="https://console.groq.com" target="_blank">console.groq.com</a>. After adding, go to Models and add e.g. llama-3.1-8b-instant.</p>
  `;
}

// ── Models ───────────────────────────────────────────────────────────────

function renderModels(): string {
  if (models.length === 0 && providers.length === 0) {
    return '<div class="empty-state">Add a provider first, then register models.</div>';
  }

  const grouped = new Map<number, { provider: Provider | undefined; models: Model[] }>();
  for (const m of models) {
    if (!grouped.has(m.providerId)) {
      grouped.set(m.providerId, { provider: providers.find((p) => p.id === m.providerId), models: [] });
    }
    grouped.get(m.providerId)!.models.push(m);
  }

  let html = "";
  for (const [, group] of grouped) {
    html += `<div class="section-title">${esc(group.provider?.name ?? "Unknown")}</div>`;
    for (const m of group.models) {
      html += `
        <div class="card">
          <div class="card-header">
            <span class="card-title">${esc(m.displayName || m.modelName)}</span>
            <span style="font-size:10px;color:${m.enabled ? "var(--success)" : "var(--subtle)"}">${m.enabled ? "active" : "disabled"}</span>
          </div>
          <div style="font-size:11px;color:var(--subtle)">In: $${m.inputCostPer1k}/1k tok &nbsp;|&nbsp; Out: $${m.outputCostPer1k}/1k tok</div>
        </div>`;
    }
  }

  if (providers.length > 0) {
    const provOpts = providers.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
    html += `
      <div class="section-title">Add Model</div>
      <div class="form-group"><label>Provider</label><select id="model-provider">${provOpts}</select></div>
      <div class="form-group"><label>Model Name</label><input type="text" id="model-name" placeholder="e.g. llama-3.1-8b-instant (Groq), gpt-4 (OpenAI)" /></div>
      <div class="form-group"><label>Input Cost / 1k tokens</label><input type="number" id="model-input-cost" step="0.0001" value="0" /></div>
      <div class="form-group"><label>Output Cost / 1k tokens</label><input type="number" id="model-output-cost" step="0.0001" value="0" /></div>
      <button type="button" class="btn btn-primary" id="add-model-btn">Add Model</button>
      <p style="font-size:10px;color:var(--subtle);margin-top:6px"><strong>Groq:</strong> use exact name e.g. <code>llama-3.1-8b-instant</code>, <code>llama-3.1-70b-versatile</code>, <code>mixtral-8x7b-32768</code> (not &quot;llama-1&quot;). <strong>OpenAI:</strong> gpt-4, gpt-3.5-turbo.</p>
    `;
  }

  return html;
}

// ── Credits ─────────────────────────────────────────────────────────────

function renderCredits(): string {
  if (credits.length === 0) {
    return '<div class="empty-state">No credit limits configured.<br/>Set them via the proxy API.</div>';
  }

  return credits.map((c) => {
    const pct = c.totalLimit > 0 ? Math.min((c.usedAmount / c.totalLimit) * 100, 100) : 0;
    const color = pct >= 90 ? "var(--error)" : pct >= 70 ? "var(--warning)" : "var(--success)";
    const provName = providers.find((p) => p.id === c.providerId)?.name ?? "Global";
    const remaining = c.totalLimit - c.usedAmount;
    const resetStr = new Date(c.resetDate).toLocaleDateString();

    return `
      <div class="card">
        <div class="card-header">
          <span class="card-title">${esc(provName)} — ${c.limitType}</span>
          <span style="font-size:10px;color:var(--subtle)">${c.hardLimit ? "hard limit" : "soft limit"}</span>
        </div>
        <div style="font-size:11px;margin-top:4px">${remaining.toLocaleString()} / ${c.totalLimit.toLocaleString()} remaining</div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${color}"></div></div>
        <div style="font-size:10px;color:var(--subtle);margin-top:4px">Resets ${c.resetPeriod} — next: ${resetStr}</div>
      </div>
    `;
  }).join("");
}

// ── Activity ────────────────────────────────────────────────────────────

function renderActivity(): string {
  return `
    <div class="stat-grid">
      <div class="stat-card"><div class="stat-value">${usage.totalRequests.toLocaleString()}</div><div class="stat-label">Requests</div></div>
      <div class="stat-card"><div class="stat-value">${(usage.totalTokens / 1000).toFixed(1)}k</div><div class="stat-label">Tokens</div></div>
      <div class="stat-card" style="grid-column:span 2"><div class="stat-value">$${usage.totalCost.toFixed(4)}</div><div class="stat-label">Total Cost</div></div>
    </div>
    ${usage.byModel.length > 0 ? `
      <div class="section-title">By Model</div>
      ${usage.byModel.map((m) => `
        <div class="card">
          <div class="card-header">
            <span class="card-title">${esc(m.modelName)}</span>
            <span style="font-size:10px;color:var(--subtle)">${m.requests} req</span>
          </div>
          <div style="font-size:11px;color:var(--subtle)">${m.tokens.toLocaleString()} tokens &nbsp;|&nbsp; $${m.cost.toFixed(4)}</div>
        </div>
      `).join("")}
    ` : '<div class="empty-state" style="margin-top:16px">No usage recorded yet.</div>'}
  `;
}

// ── Events ──────────────────────────────────────────────────────────────

function bindEvents(): void {
  // Login
  document.getElementById("login-btn")?.addEventListener("click", () => {
    const email = (document.getElementById("login-email") as HTMLInputElement | null)?.value.trim() ?? "";
    const password = (document.getElementById("login-password") as HTMLInputElement | null)?.value ?? "";
    vscode.postMessage({ type: "login", email, password });
  });
  document.getElementById("register-btn")?.addEventListener("click", () => {
    const email = (document.getElementById("login-email") as HTMLInputElement | null)?.value.trim() ?? "";
    const password = (document.getElementById("login-password") as HTMLInputElement | null)?.value ?? "";
    const name = email.split("@")[0] || "User";
    vscode.postMessage({ type: "register", email, password, name });
  });

  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab!;
      console.log("[AI Firewall webview] Tab clicked:", currentTab);
      if (currentTab === "providers") { vscode.postMessage({ type: "loadProviders" }); }
      if (currentTab === "models") { vscode.postMessage({ type: "loadModels" }); }
      if (currentTab === "credits") { vscode.postMessage({ type: "loadCredits" }); }
      if (currentTab === "activity") { vscode.postMessage({ type: "loadUsage" }); }
      render();
    });
  });

  const modelSelect = document.getElementById("model-select") as HTMLSelectElement | null;
  modelSelect?.addEventListener("change", () => { selectedModel = modelSelect.value; });

  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById("send-btn") as HTMLButtonElement | null;

  chatInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      triggerSend();
    }
  });

  chatInput?.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";

    // Detect @ mention trigger
    const val = chatInput.value;
    const cur = chatInput.selectionStart ?? 0;
    // Find the last @ before cursor that isn't preceded by a non-space
    const before = val.slice(0, cur);
    const atIdx = before.lastIndexOf("@");
    if (atIdx !== -1 && (atIdx === 0 || /\s/.test(val[atIdx - 1]))) {
      const query = before.slice(atIdx + 1);
      if (!query.includes(" ")) {
        mentionDropdownVisible = true;
        mentionDropdownQuery = query;
        mentionDropdownIdx = 0;
        mentionAtStart = atIdx;
        vscode.postMessage({ type: "requestMentionSearch", query });
        return;
      }
    }
    // Close dropdown if @ context gone
    if (mentionDropdownVisible) {
      mentionDropdownVisible = false;
      mentionAtStart = -1;
      render();
    }
  });

  sendBtn?.addEventListener("click", () => {
    console.log("[AI Firewall webview] Send button clicked");
    triggerSend();
  });

  document.getElementById("pf-confirm")?.addEventListener("click", confirmSend);
  document.getElementById("pf-cancel")?.addEventListener("click", () => {
    pendingEstimate = null;
    pendingMessages = [];
    render();
  });

  // Provider buttons
  document.querySelectorAll<HTMLButtonElement>(".preset-provider").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nameEl = document.getElementById("prov-name") as HTMLInputElement;
      const urlEl = document.getElementById("prov-url") as HTMLInputElement;
      if (nameEl) nameEl.value = btn.dataset.name ?? "";
      if (urlEl) urlEl.value = btn.dataset.url ?? "";
    });
  });

  document.getElementById("add-provider-btn")?.addEventListener("click", () => {
    const name = (document.getElementById("prov-name") as HTMLInputElement).value.trim();
    const apiKey = (document.getElementById("prov-key") as HTMLInputElement).value.trim();
    const baseUrl = (document.getElementById("prov-url") as HTMLInputElement).value.trim();
    if (!name || !apiKey || !baseUrl) { return; }
    vscode.postMessage({ type: "addProvider", name, apiKey, baseUrl });
  });

  document.getElementById("configure-restrictions-btn")?.addEventListener("click", () => {
    vscode.postMessage({ type: "configureRestrictions" });
  });

  document.getElementById("attach-files-btn")?.addEventListener("click", () => {
    vscode.postMessage({ type: "attachFiles" });
  });

  // Agent mode toggle
  document.getElementById("agent-mode-toggle")?.addEventListener("change", (e) => {
    agentMode = (e.target as HTMLInputElement).checked;
  });

  // Diff modal accept / reject
  document.querySelectorAll<HTMLButtonElement>(".diff-accept").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      const op = pendingFileOps[idx];
      if (op) {
        vscode.postMessage({ type: "applyFileOperation", opType: op.type, filePath: op.path, content: op.content });
        pendingFileOps = pendingFileOps.filter((_, i) => i !== idx);
        render();
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".diff-reject").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.idx);
      pendingFileOps = pendingFileOps.filter((_, i) => i !== idx);
      render();
    });
  });
  document.getElementById("diff-dismiss-all")?.addEventListener("click", () => {
    pendingFileOps = [];
    render();
  });

  // @ mention chip removal
  document.querySelectorAll<HTMLButtonElement>(".mention-chip-x").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      mentionedFiles = mentionedFiles.filter((_, i) => i !== idx);
      render();
    });
  });

  // @ mention dropdown option clicks
  document.querySelectorAll<HTMLDivElement>(".mention-option").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault(); // prevent blur before click
      acceptMentionOption(el.dataset.path ?? "");
    });
  });

  // @ mention input handling
  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  chatInput?.addEventListener("keydown", (e) => {
    if (mentionDropdownVisible) {
      if (e.key === "ArrowDown") { e.preventDefault(); mentionDropdownIdx = Math.min(mentionDropdownIdx + 1, mentionDropdownResults.length - 1); render(); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); mentionDropdownIdx = Math.max(mentionDropdownIdx - 1, 0); render(); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (mentionDropdownResults[mentionDropdownIdx]) { acceptMentionOption(mentionDropdownResults[mentionDropdownIdx]); }
        return;
      }
      if (e.key === "Escape") { mentionDropdownVisible = false; mentionAtStart = -1; render(); return; }
    }
  });

  document.querySelectorAll<HTMLButtonElement>(".delete-provider").forEach((btn) => {
    btn.addEventListener("click", () => {
      vscode.postMessage({ type: "deleteProvider", id: Number(btn.dataset.id) });
    });
  });

  document.querySelectorAll<HTMLButtonElement>(".toggle-provider").forEach((btn) => {
    btn.addEventListener("click", () => {
      const enabled = btn.dataset.enabled === "1";
      vscode.postMessage({ type: "toggleProvider", id: Number(btn.dataset.id), enabled: !enabled });
    });
  });

  // Model buttons
  document.getElementById("add-model-btn")?.addEventListener("click", () => {
    const providerId = Number((document.getElementById("model-provider") as HTMLSelectElement).value);
    const modelName = (document.getElementById("model-name") as HTMLInputElement).value.trim();
    const inputCostPer1k = Number((document.getElementById("model-input-cost") as HTMLInputElement).value);
    const outputCostPer1k = Number((document.getElementById("model-output-cost") as HTMLInputElement).value);
    if (!modelName) { return; }
    vscode.postMessage({ type: "addModel", providerId, modelName, displayName: modelName, inputCostPer1k, outputCostPer1k });
  });

  // Code block action buttons
  document.querySelectorAll<HTMLButtonElement>(".cb-insert").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = codeBlockStore.get(btn.dataset.id!);
      if (code) { vscode.postMessage({ type: "insertCode", code }); }
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".cb-replace").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = codeBlockStore.get(btn.dataset.id!);
      if (code) { vscode.postMessage({ type: "replaceSelection", code }); }
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".cb-copy").forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = codeBlockStore.get(btn.dataset.id!);
      if (code) { vscode.postMessage({ type: "copyCode", code }); }
    });
  });

  // Scroll chat to bottom
  const chatMsgs = document.getElementById("chat-messages");
  if (chatMsgs) { chatMsgs.scrollTop = chatMsgs.scrollHeight; }
}

/** Accept the highlighted option from the @ mention dropdown */
function acceptMentionOption(filePath: string): void {
  if (!filePath) return;
  if (!mentionedFiles.includes(filePath)) {
    mentionedFiles.push(filePath);
  }

  // Remove @query from the textarea
  const input = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  if (input && mentionAtStart !== -1) {
    const cur = input.selectionStart ?? 0;
    input.value = input.value.slice(0, mentionAtStart) + input.value.slice(cur);
    input.setSelectionRange(mentionAtStart, mentionAtStart);
  }

  mentionDropdownVisible = false;
  mentionAtStart = -1;
  mentionDropdownResults = [];
  render();
}

function triggerSend(): void {
  const input = document.getElementById("chat-input") as HTMLTextAreaElement;
  const text = input?.value.trim();
  console.log("[AI Firewall webview] triggerSend called, text length:", text?.length ?? 0, "isLoading:", isLoading);
  if (!text || isLoading) {
    console.log("[AI Firewall webview] triggerSend bailed (empty text or already loading)");
    return;
  }

  const enabled = models.filter((m) => m.enabled && (m.registered !== false));
  if (enabled.length === 0 || !selectedModel || !enabled.some((m) => m.modelName === selectedModel)) {
    showToast("Add and select a model in the Models tab first.");
    return;
  }

  // Context overflow check
  const selInfo = selectedModelInfo();
  const ctxLimit = selInfo?.maxContextTokens ?? 0;
  if (ctxLimit > 0 && currentContextTokens() > ctxLimit) {
    showToast(`Context (${currentContextTokens().toLocaleString()} tok) exceeds ${selInfo!.displayName} limit (${ctxLimit.toLocaleString()} tok). Clear chat or switch models.`);
    return;
  }

  // Build messages — prepend agent system prompt when agent mode is on
  const userMsg: ChatMsg = { role: "user", content: text };
  const baseMessages: ChatMsg[] = agentMode
    ? [
        {
          role: "system",
          content: [
            "You are an AI coding assistant with the ability to create and edit files.",
            "When you want to create a new file, wrap the content like this:",
            '<create_file path="relative/path/to/file.ext">file content here</create_file>',
            "When you want to edit an existing file, wrap the full new content like this:",
            '<edit_file path="relative/path/to/file.ext">full new file content</edit_file>',
            "Always output a <plan> block first for complex tasks, explaining your steps before executing them.",
            "Only use these tags when you are certain — a human will review and approve each operation before it is applied."
          ].join("\n")
        },
        ...chatHistory,
        userMsg
      ]
    : [...chatHistory, userMsg];

  chatHistory.push(userMsg);
  input.value = "";

  pendingMessages = baseMessages;

  // Merge @mentioned files with attached files
  const allFilePaths = [...new Set([...pendingFilePaths, ...mentionedFiles])];

  if (showPreFlight) {
    console.log("[AI Firewall webview] postMessage(estimate)", { model: selectedModel, messageCount: baseMessages.length });
    vscode.postMessage({ type: "estimate", model: selectedModel, messages: baseMessages, filePaths: allFilePaths, bypassedFilePaths: pendingBypassedPaths });
    isLoading = true;
    render();
  } else {
    console.log("[AI Firewall webview] postMessage(chat) (no preflight)", { model: selectedModel, messageCount: baseMessages.length });
    sendDirectly(baseMessages);
  }
}

function confirmSend(): void {
  pendingEstimate = null;
  sendDirectly(pendingMessages);
}

function sendDirectly(messages: ChatMsg[]): void {
  console.log("[AI Firewall webview] sendDirectly", { model: selectedModel, messageCount: messages.length });
  isLoading = true;
  const bypassedPaths = [...pendingBypassedPaths];
  const allFilePaths = [...new Set([...pendingFilePaths, ...mentionedFiles])];
  pendingFilePaths = [];
  pendingBypassedPaths = [];
  mentionedFiles = [];
  render();
  vscode.postMessage({ type: "chat", model: selectedModel, messages, filePaths: allFilePaths, bypassedFilePaths: bypassedPaths });
}

function showToast(msg: string): void {
  toastMsg = msg;
  render();
  if (toastTimer) { clearTimeout(toastTimer); }
  toastTimer = setTimeout(() => { toastMsg = ""; render(); }, 3200);
}

function esc(str: string): string {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

/** Rough token estimate: ~4 chars per token */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function currentContextTokens(): number {
  return chatHistory.reduce((sum, m) => sum + estimateTokens(m.content), 0);
}

function selectedModelInfo(): Model | undefined {
  return models.find((m) => m.modelName === selectedModel);
}

let codeBlockCounter = 0;
const codeBlockStore = new Map<string, string>();

function decodeHtmlEntities(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? html;
}

function renderAssistantContent(content: string): string {
  const rawHtml = marked.parse(content, { async: false }) as string;
  const sanitized = rawHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, "");
  const preCodeRegex = /<pre><code(?:\s+class="[^"]*language-(\w+)")?>([\s\S]*?)<\/code><\/pre>/gi;
  const parts: string[] = [];
  let lastEnd = 0;
  let match;
  while ((match = preCodeRegex.exec(sanitized)) !== null) {
    parts.push(sanitized.slice(lastEnd, match.index));
    const lang = (match[1] || "code").toLowerCase();
    const escapedContent = match[2];
    const code = decodeHtmlEntities(escapedContent);
    const blockId = `cb-${codeBlockCounter++}`;
    codeBlockStore.set(blockId, code);
    parts.push(`
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-block-lang">${esc(lang)}</span>
          <div class="code-block-actions">
            <button type="button" class="btn btn-sm btn-primary cb-insert" data-id="${blockId}" title="Insert at cursor">Insert</button>
            <button type="button" class="btn btn-sm btn-secondary cb-replace" data-id="${blockId}" title="Replace selection">Replace</button>
            <button type="button" class="btn btn-sm btn-secondary cb-copy" data-id="${blockId}" title="Copy to clipboard">Copy</button>
          </div>
        </div>
        <pre class="code-block-pre"><code>${esc(code)}</code></pre>
      </div>
    `);
    lastEnd = match.index + match[0].length;
  }
  parts.push(sanitized.slice(lastEnd));
  return parts.join("");
}

// ── Message handler ─────────────────────────────────────────────────────

window.addEventListener("message", (event) => {
  const msg = event.data as VsMessage;

  switch (msg.type) {
    case "config": {
      const data = msg.data as { defaultModel?: string; showPreFlight?: boolean };
      if (data.showPreFlight !== undefined) { showPreFlight = data.showPreFlight; }
      if (data.defaultModel) { configuredDefaultModel = data.defaultModel; }
      render();
      break;
    }

    case "connectionStatus":
      connected = msg.connected as boolean;
      render();
      break;

    case "authStatus":
      authed = !!msg.authed;
      authUser = (msg.user as any) ?? null;
      if (!authed) {
        currentTab = "chat";
      } else {
        // Load initial lists after login
        vscode.postMessage({ type: "loadProviders" });
        vscode.postMessage({ type: "loadModels" });
      }
      render();
      break;

    case "estimateResult":
      isLoading = false;
      pendingEstimate = msg.data as EstResult;
      render();
      break;

    case "chatResponse": {
      isLoading = false;
      const resp = msg.data as {
        choices?: Array<{ message?: { content: string } }>;
        _firewall?: { action?: string; redacted_messages?: Array<{ role: string; content: string }>; secrets_found?: number; pii_found?: number; model_used?: string };
      };
      const fw = resp._firewall;
      if (fw?.action === "REDACT" && Array.isArray(fw.redacted_messages) && fw.redacted_messages.length > 0) {
        let lastRedactedUserContent: string | undefined;
        for (let i = fw.redacted_messages.length - 1; i >= 0; i--) {
          if (fw.redacted_messages[i].role === "user") {
            lastRedactedUserContent = fw.redacted_messages[i].content;
            break;
          }
        }
        if (lastRedactedUserContent !== undefined) {
          let lastUserIdx = -1;
          for (let i = chatHistory.length - 1; i >= 0; i--) {
            if (chatHistory[i].role === "user") {
              lastUserIdx = i;
              break;
            }
          }
          if (lastUserIdx >= 0) {
            chatHistory[lastUserIdx] = { ...chatHistory[lastUserIdx], content: lastRedactedUserContent };
          }
        }
        const n = (fw.secrets_found ?? 0) + (fw.pii_found ?? 0);
        if (n > 0) {
          chatHistory.push({ role: "system", content: `↳ Sent with redaction (${fw.secrets_found ?? 0} secrets, ${fw.pii_found ?? 0} PII removed)` });
        }
      }
      const content = resp.choices?.[0]?.message?.content ?? "(no response)";
      chatHistory.push({ role: "assistant", content });
      const modelUsed = fw?.model_used ?? selectedModel;
      if (modelUsed) {
        chatHistory.push({ role: "system", content: `↳ ${modelUsed}` });
      }
      render();
      break;
    }

    case "chatError":
      isLoading = false;
      chatHistory.push({ role: "system", content: `Error: ${msg.message}` });
      render();
      break;

    case "error":
      showToast(`Error: ${msg.message}`);
      isLoading = false;
      render();
      break;

    case "providers":
      providers = (msg.data as Provider[]) ?? [];
      render();
      break;

    case "models": {
      models = (msg.data as Model[]) ?? [];
      const enabled = models.filter((m) => m.enabled && (m.registered !== false));
      if (enabled.length > 0) {
        const currentValid = enabled.some((m) => m.modelName === selectedModel);
        if (!currentValid) {
          selectedModel = enabled[0].modelName;
        }
      } else {
        selectedModel = "";
      }
      render();
      break;
    }

    case "credits":
      credits = (msg.data as Credit[]) ?? [];
      render();
      break;

    case "usage":
      usage = msg.data as UsageSummary;
      render();
      break;

    case "toast":
      showToast(msg.message as string);
      break;

    case "navigate":
      currentTab = msg.tab as string;
      render();
      break;

    case "attachedFiles": {
      pendingFilePaths = (msg.safeFiles as string[]) ?? [];
      pendingBypassedPaths = (msg.bypassedFiles as string[]) ?? [];
      render();
      break;
    }

    case "mentionSearchResults": {
      mentionDropdownResults = (msg.results as string[]) ?? [];
      mentionDropdownIdx = 0;
      // Re-render only the dropdown overlay, not the full view, to avoid losing cursor
      const dd = document.getElementById("mention-dropdown");
      if (!dd && mentionDropdownResults.length > 0) {
        render(); // first time — needs full render to inject dropdown
      } else if (dd) {
        dd.innerHTML = mentionDropdownResults.map((f, i) =>
          `<div class="mention-option ${i === mentionDropdownIdx ? "selected" : ""}" data-idx="${i}" data-path="${esc(f)}">${esc(f)}</div>`
        ).join("");
        // re-bind option clicks
        dd.querySelectorAll<HTMLDivElement>(".mention-option").forEach((el) => {
          el.addEventListener("mousedown", (e) => {
            e.preventDefault();
            acceptMentionOption(el.dataset.path ?? "");
          });
        });
      } else if (mentionDropdownResults.length === 0 && mentionDropdownVisible) {
        mentionDropdownVisible = false;
        render();
      }
      break;
    }

    case "fileOperations": {
      const ops = (msg.operations as FileOp[]) ?? [];
      if (ops.length > 0) {
        pendingFileOps = ops;
        render();
      }
      break;
    }

    case "injectPrompt": {
      currentTab = "chat";
      const prompt = msg.prompt as string;
      pendingFilePaths = (msg.filePaths as string[]) ?? [];
      chatHistory.push({ role: "user", content: prompt });
      pendingMessages = [...chatHistory];
      if (showPreFlight) {
        vscode.postMessage({ type: "estimate", model: selectedModel, messages: pendingMessages, filePaths: pendingFilePaths });
        isLoading = true;
      } else {
        sendDirectly(pendingMessages);
      }
      render();
      break;
    }
  }
});

// ── Init ────────────────────────────────────────────────────────────────

console.log("[AI Firewall webview] Script loaded, calling render() and posting ready");
render();
vscode.postMessage({ type: "ready" });
