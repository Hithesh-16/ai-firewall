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
let pendingImages: { name: string; dataUrl: string }[] = [];
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
let autoApplyOps = false; // auto-apply file ops without diff review

// Pending file operations from LLM
let pendingFileOps: FileOp[] = [];

// Model catalog from proxy
type CatalogModel = { modelName: string; displayName: string; inputCostPer1k: number; outputCostPer1k: number; maxContextTokens: number; tags?: string[] };
type CatalogProvider = { name: string; slug: string; baseUrl: string; authUrl: string; description: string; models: CatalogModel[] };
let catalog: CatalogProvider[] = [];

// Provider setup state (Providers tab)
let setupProviderSlug = ""; // which catalog provider is being configured
let setupApiKey = "";
let selectedCatalogModels: Set<string> = new Set();

// Phase indicator state
let currentPhase = "";
let currentPhaseLabel = "";

// MCP server management state
type McpServer = { name: string; targetUrl: string; online?: boolean };
let mcpServers: McpServer[] = [];
let mcpNewName = "";
let mcpNewUrl = "";

// Typewriter animation state (used when receiving full response at once)
let typewriterTimer: ReturnType<typeof setInterval> | null = null;

// Real-streaming state
let streamingActive = false;
let streamingAccum = "";      // full text accumulated across all chatChunk messages
let streamingDiv: HTMLDivElement | null = null;

// ── Rendering ──────────────────────────────────────────────────────────

function render(): void {
  // ── Preserve textarea state so re-renders never clear what the user is typing ──
  const prevInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const savedText   = prevInput?.value ?? "";
  const savedHeight = prevInput?.style.height ?? "";
  const hadFocus    = document.activeElement === prevInput;

  const app = document.getElementById("app")!;
  app.innerHTML = `
    ${renderConnectionBar()}
    ${authed ? `
      <div class="tabs" role="tablist" aria-label="AI Firewall panels">
        ${renderTab("chat", "Chat")}
        ${renderTab("providers", "Providers")}
        ${renderTab("models", "Models")}
        ${renderTab("credits", "Credits")}
        ${renderTab("activity", "Activity")}
        ${renderTab("mcp", "MCP")}
      </div>
      <div class="panel ${currentTab === "chat" ? "active" : ""}" id="panel-chat" role="tabpanel" aria-label="Chat">
        ${renderChat()}
      </div>
      <div class="panel ${currentTab === "providers" ? "active" : ""}" id="panel-providers" role="tabpanel" aria-label="Providers">
        ${renderProviders()}
      </div>
      <div class="panel ${currentTab === "models" ? "active" : ""}" id="panel-models" role="tabpanel" aria-label="Models">
        ${renderModels()}
      </div>
      <div class="panel ${currentTab === "credits" ? "active" : ""}" id="panel-credits" role="tabpanel" aria-label="Credits">
        ${renderCredits()}
      </div>
      <div class="panel ${currentTab === "activity" ? "active" : ""}" id="panel-activity" role="tabpanel" aria-label="Activity">
        ${renderActivity()}
      </div>
      <div class="panel ${currentTab === "mcp" ? "active" : ""}" id="panel-mcp" role="tabpanel" aria-label="MCP Servers">
        ${renderMcp()}
      </div>
    ` : `
      <div class="panel active" id="panel-login">
        ${renderLogin()}
      </div>
    `}
    ${toastMsg ? `<div class="toast" role="alert" aria-live="assertive">${esc(toastMsg)}</div>` : ""}
  `;
  bindEvents();

  // ── Restore textarea content and focus after DOM replacement ──
  const newInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  if (newInput) {
    if (savedText)   { newInput.value = savedText; newInput.style.height = savedHeight; }
    if (hadFocus)    { newInput.focus(); }
  }
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
  const active = currentTab === id;
  return `<button type="button" class="tab ${active ? "active" : ""}" data-tab="${id}" role="tab" aria-selected="${active}" aria-controls="panel-${id}">${label}</button>`;
}

// ── Chat ────────────────────────────────────────────────────────────────

// SVG icons as constants
const ICON_SEND = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 1l7 7-7 7M15 8H1"/></svg>`;
const ICON_SEND_FILLED = `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="8"/><path d="M8 4.5l3.5 3.5-3.5 3.5M11.5 8h-7" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
const ICON_ATTACH = `<svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" aria-hidden="true"><path d="M3.5 10.5v-6a4 4 0 0 1 8 0v7a2.5 2.5 0 0 1-5 0v-6a1 1 0 0 1 2 0v5.5"/></svg>`;

function renderChat(): string {
  const enabledModels = models.filter((m) => m.enabled && (m.registered !== false));

  const ctxTokens = currentContextTokens();
  const modelOpts = enabledModels
    .map((m) => {
      const ctxLimit = m.maxContextTokens ?? 0;
      const overflows = ctxLimit > 0 && ctxTokens > ctxLimit;
      const ctxHint = ctxLimit > 0 ? ` (${Math.round(ctxLimit / 1000)}k)` : "";
      const label = esc(m.displayName || m.modelName) + ctxHint + (overflows ? " ⚠" : "");
      return `<option value="${esc(m.modelName)}" ${m.modelName === selectedModel ? "selected" : ""}>${label}</option>`;
    })
    .join("");

  const noModelsOpt =
    enabledModels.length === 0
      ? '<option value="" disabled>— Add models in Models tab —</option>'
      : "";

  const selInfo = selectedModelInfo();
  const ctxLimit = selInfo?.maxContextTokens ?? 0;
  const ctxOverflow = ctxLimit > 0 && ctxTokens > ctxLimit;

  // Build chat messages
  let msgs = chatHistory.map((m, idx) => {
    if (m.role === "assistant") {
      return `<div class="msg assistant" role="article" aria-label="Assistant message ${idx + 1}"><div class="markdown-preview">${renderAssistantContent(m.content)}</div></div>`;
    }
    if (m.role === "system") {
      return `<div class="msg system" role="status">${esc(m.content)}</div>`;
    }
    return `<div class="msg user" role="article" aria-label="Your message ${idx + 1}"><div class="msg-bubble">${esc(m.content)}</div></div>`;
  }).join("");

  // Phase indicator — animated phases like Copilot/Cursor
  if (isLoading) {
    const phaseIcons: Record<string, string> = {
      thinking: "🧠", reading: "📖", writing: "✍️", applying: "📝", running: "▶️", done: ""
    };
    const icon = phaseIcons[currentPhase] ?? "🧠";
    const label = currentPhaseLabel || "Thinking…";
    msgs += `<div class="msg phase-indicator" role="status" aria-live="polite" aria-label="${esc(label)}">
      <div class="phase-row">
        <span class="phase-icon" aria-hidden="true">${icon}</span>
        <span class="phase-label">${esc(label)}</span>
        <span class="phase-dots">
          <span class="typing-dot" style="animation-delay:0ms"></span>
          <span class="typing-dot" style="animation-delay:150ms"></span>
          <span class="typing-dot" style="animation-delay:300ms"></span>
        </span>
      </div>
    </div>`;
  }

  const preflightHtml = pendingEstimate ? renderPreFlight(pendingEstimate) : "";
  const diffModal = pendingFileOps.length > 0 ? renderDiffModal(pendingFileOps) : "";

  const canSend = enabledModels.length > 0
    && (selectedModel === "" || enabledModels.some((m) => m.modelName === selectedModel))
    && !ctxOverflow;

  const totalAttached = pendingFilePaths.length + pendingBypassedPaths.length + pendingImages.length + mentionedFiles.length;

  // @ mention chips row
  const mentionChips = mentionedFiles.length > 0
    ? `<div class="mention-chips" id="mention-chips">${mentionedFiles.map((f, i) =>
        `<span class="mention-chip">@${esc(f)}<button class="mention-chip-x" data-idx="${i}" title="Remove" aria-label="Remove ${esc(f)}">×</button></span>`
      ).join("")}</div>`
    : "";

  // @ mention dropdown
  const dropdownHtml = mentionDropdownVisible && mentionDropdownResults.length > 0
    ? `<div class="mention-dropdown" id="mention-dropdown" role="listbox" aria-label="File suggestions">${
        mentionDropdownResults.map((f, i) =>
          `<div class="mention-option ${i === mentionDropdownIdx ? "selected" : ""}" role="option" aria-selected="${i === mentionDropdownIdx}" tabindex="-1" data-idx="${i}" data-path="${esc(f)}">${esc(f)}</div>`
        ).join("")
      }</div>`
    : "";

  // Image preview strip
  const imagePreviewHtml = pendingImages.length > 0
    ? `<div class="composer-previews" aria-label="Attached images">${pendingImages.map((img, i) =>
        `<div class="preview-item" title="${esc(img.name)}">
          <img src="${img.dataUrl}" alt="${esc(img.name)}" class="preview-thumb" />
          <button class="preview-remove" data-img-idx="${i}" aria-label="Remove ${esc(img.name)}">×</button>
        </div>`
      ).join("")}</div>`
    : "";

  // File attachment chips (non-image)
  const fileChips = pendingFilePaths.length + pendingBypassedPaths.length > 0
    ? `<div class="composer-file-chips">${[...pendingFilePaths, ...pendingBypassedPaths].map((f, i) =>
        `<span class="file-chip${i >= pendingFilePaths.length ? " bypassed" : ""}" title="${esc(f)}">${esc(f.split(/[/\\]/).pop() ?? f)}<button class="file-chip-x" data-file-idx="${i}" aria-label="Remove ${esc(f)}">×</button></span>`
      ).join("")}</div>`
    : "";

  const hasMsgs = chatHistory.length > 0;
  const ctxTokLabel = ctxTokens > 0 ? `~${ctxTokens >= 1000 ? Math.round(ctxTokens / 100) / 10 + "k" : ctxTokens} tok` : "";

  return `
    <div class="chat-wrap">
      <!-- Model bar -->
      <div class="model-bar" role="toolbar" aria-label="Chat controls">
        <select id="model-select" aria-label="Select model" class="model-select-inline">${noModelsOpt}${modelOpts}</select>
        ${ctxTokLabel ? `<span class="ctx-tok${ctxOverflow ? " ctx-overflow" : ""}" title="Estimated tokens in context">${esc(ctxTokLabel)}${ctxOverflow ? " ⚠" : ""}</span>` : ""}
        <label class="agent-toggle" title="Agent mode: AI can create and edit files">
          <input type="checkbox" id="agent-mode-toggle" ${agentMode ? "checked" : ""} aria-label="Agent mode">
          <span>Agent</span>
        </label>
        ${agentMode ? `<label class="agent-toggle" title="Auto-apply: LLM edits files directly without approval" style="color:${autoApplyOps ? "var(--warning)" : "var(--subtle)"}">
          <input type="checkbox" id="auto-apply-toggle" ${autoApplyOps ? "checked" : ""} aria-label="Auto-apply file edits">
          <span>Auto-edit</span>
        </label>` : ""}
        ${hasMsgs ? `<button type="button" class="icon-btn" id="clear-chat-btn" title="Clear (Ctrl+Shift+K)" aria-label="Clear conversation">
          <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true"><path d="M1 1l11 11M12 1L1 12"/></svg>
        </button>` : ""}
      </div>

      ${ctxOverflow ? `<div role="alert" class="ctx-overflow-alert">Context too large for <b>${esc(selInfo?.displayName ?? selectedModel)}</b>. Clear chat or switch to a larger model.</div>` : ""}

      <!-- Messages -->
      <div class="chat-messages" id="chat-messages" role="log" aria-label="Conversation" aria-live="polite" aria-relevant="additions">
        ${msgs || `<div class="empty-state" role="status">
          <div class="empty-icon" aria-hidden="true">✦</div>
          <div>How can I help you today?</div>
          <div class="empty-hint">Type <kbd>@</kbd> to attach files · Enable <b>Agent</b> to create/edit files</div>
        </div>`}
      </div>

      ${preflightHtml}
      ${diffModal}

      <!-- Composer -->
      <div class="chat-composer" role="search" aria-label="Chat input">
        ${mentionChips}
        ${dropdownHtml}
        ${imagePreviewHtml}
        ${fileChips}
        <div class="composer-input-row">
          <textarea
            class="composer-input"
            id="chat-input"
            placeholder="Message… (@ to attach files)"
            rows="1"
            aria-label="Chat message"
            aria-multiline="true"
            aria-haspopup="${mentionDropdownVisible ? "listbox" : "false"}"
            aria-expanded="${mentionDropdownVisible}"
            aria-controls="${mentionDropdownVisible ? "mention-dropdown" : ""}"
            aria-autocomplete="list"
            ${isLoading ? 'aria-disabled="true"' : ""}
          ></textarea>
        </div>
        <div class="composer-footer">
          <button type="button" class="icon-btn attach-btn" id="attach-files-btn" title="Attach files or images" aria-label="${totalAttached > 0 ? `Attach files (${totalAttached} attached)` : "Attach files"}">
            ${ICON_ATTACH}${totalAttached > 0 ? `<span class="attach-badge">${totalAttached}</span>` : ""}
          </button>
          <div class="composer-footer-spacer"></div>
          <button type="button" class="send-icon-btn" id="send-btn" ${isLoading || !canSend ? "disabled" : ""} aria-label="Send message" title="Send (Enter)">
            ${ICON_SEND_FILLED}
          </button>
        </div>
      </div>

      <div class="sr-only" aria-live="polite" id="a11y-announce"></div>
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

// Provider icons as emoji (fallback for all providers)
const PROVIDER_ICONS: Record<string, string> = {
  openai: "🤖", anthropic: "🟠", "google-gemini": "💎", groq: "⚡",
  mistral: "🌊", xai: "𝕏", deepseek: "🔵", together: "🤝",
  perplexity: "🔍", ollama: "🦙"
};

function renderProviders(): string {
  // Active providers list
  const activeList = providers.length > 0 ? `
    <div class="section-title">Active Providers</div>
    <div class="provider-active-list">
      ${providers.map((p) => `
        <div class="provider-active-card">
          <div class="provider-active-info">
            <span class="provider-active-name">${esc(p.name)}</span>
            <span class="provider-active-url">${esc(p.baseUrl)}</span>
          </div>
          <div class="provider-active-actions">
            <span class="provider-status-dot" style="background:${p.enabled ? "var(--success)" : "var(--error)"}"></span>
            <button type="button" class="btn btn-secondary btn-sm toggle-provider" data-id="${p.id}" data-enabled="${p.enabled ? "1" : "0"}">${p.enabled ? "Disable" : "Enable"}</button>
            <button type="button" class="btn btn-danger btn-sm delete-provider" data-id="${p.id}">×</button>
          </div>
        </div>
      `).join("")}
    </div>
  ` : "";

  // Determine if we're in setup mode for a specific provider
  const catalogEntry = catalog.find((c) => c.slug === setupProviderSlug);

  if (setupProviderSlug && catalogEntry) {
    // Step 2: API key + model selection for a specific provider
    const modelCheckboxes = catalogEntry.models.map((m) => `
      <label class="model-check-row" style="display:flex;align-items:flex-start;gap:6px;padding:5px 0;border-bottom:1px solid var(--border);cursor:pointer">
        <input type="checkbox" class="catalog-model-check" data-model='${JSON.stringify({ modelName: m.modelName, displayName: m.displayName, inputCostPer1k: m.inputCostPer1k, outputCostPer1k: m.outputCostPer1k, maxContextTokens: m.maxContextTokens })}' ${selectedCatalogModels.has(m.modelName) ? "checked" : ""} style="margin-top:2px;accent-color:var(--btn-bg)" />
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500">${esc(m.displayName)}</div>
          <div style="font-size:10px;color:var(--subtle)">In: $${formatCost(m.inputCostPer1k)}/1k · Out: $${formatCost(m.outputCostPer1k)}/1k · ${Math.round(m.maxContextTokens / 1000)}k ctx</div>
          ${m.tags?.length ? `<div style="margin-top:2px">${m.tags.map((t) => `<span style="font-size:9px;background:var(--input-bg);border:1px solid var(--border);border-radius:8px;padding:0 5px">${esc(t)}</span>`).join(" ")}</div>` : ""}
        </div>
      </label>
    `).join("");

    const isOllama = catalogEntry.slug === "ollama";

    return `
      ${activeList}
      <div class="section-title" style="display:flex;align-items:center;gap:8px">
        <button type="button" class="icon-btn" id="back-to-catalog-btn" aria-label="Back to catalog">←</button>
        Set up ${esc(catalogEntry.name)}
      </div>
      <div class="card" style="margin-bottom:8px">
        <div style="font-size:12px;font-weight:600;margin-bottom:6px">${esc(catalogEntry.name)}</div>
        <div style="font-size:11px;color:var(--subtle);margin-bottom:8px">${esc(catalogEntry.description)}</div>
        ${isOllama ? `<div style="font-size:11px;color:var(--warning);margin-bottom:8px">Ollama must be running locally (<code>ollama serve</code>). No API key needed.</div>` : `
          <div class="form-group">
            <label>API Key <a href="${esc(catalogEntry.authUrl)}" target="_blank" style="font-size:10px;margin-left:4px">Get key ↗</a></label>
            <input type="password" id="setup-api-key" placeholder="Paste your API key" value="${esc(setupApiKey)}" />
          </div>
        `}
        <div style="font-size:11px;font-weight:500;margin-bottom:4px">Select models to add:</div>
        <div style="max-height:280px;overflow-y:auto">${modelCheckboxes}</div>
        <div style="margin-top:10px;display:flex;gap:6px">
          <button type="button" class="btn btn-primary" id="confirm-add-provider-btn">Add ${esc(catalogEntry.name)}</button>
          <button type="button" class="btn btn-secondary btn-sm" id="back-to-catalog-btn2">Cancel</button>
        </div>
      </div>
      <div style="display:flex;justify-content:flex-end">
        <button type="button" class="btn btn-secondary btn-sm" id="configure-restrictions-btn">Restrict files/folders</button>
      </div>
    `;
  }

  // Step 1: Provider catalog tiles
  const useSources = catalog.length > 0 ? catalog : BUILTIN_CATALOG;
  const configuredSlugs = new Set(providers.map((p) => p.slug.toLowerCase().replace(/[^a-z0-9]/g, "-")));

  const tiles = useSources.map((c) => {
    const isConfigured = providers.some((p) => p.baseUrl === c.baseUrl || p.slug.toLowerCase().includes(c.slug.split("-")[0]));
    const icon = PROVIDER_ICONS[c.slug] ?? "🔌";
    return `
      <button type="button" class="provider-tile ${isConfigured ? "provider-tile-active" : ""}" data-slug="${esc(c.slug)}" title="${esc(c.description)}">
        <div class="provider-tile-icon">${icon}</div>
        <div class="provider-tile-name">${esc(c.name)}</div>
        ${isConfigured ? `<div class="provider-tile-badge">✓</div>` : ""}
      </button>
    `;
  }).join("");

  return `
    ${activeList}
    <div class="section-title" style="margin-top:${providers.length ? "10px" : "0"}">Add Provider</div>
    <div class="provider-tiles">${tiles}</div>

    <div class="section-title" style="margin-top:10px">Manual Add</div>
    <div class="form-group"><label>Name</label><input type="text" id="prov-name" placeholder="e.g. My OpenAI" /></div>
    <div class="form-group"><label>Base URL</label><input type="url" id="prov-url" placeholder="https://api.openai.com/v1" /></div>
    <div class="form-group"><label>API Key</label><input type="password" id="prov-key" placeholder="Paste your API key" /></div>
    <div style="display:flex;gap:6px;margin-top:4px">
      <button type="button" class="btn btn-primary" id="add-provider-btn">Add</button>
      <button type="button" class="btn btn-secondary btn-sm" id="configure-restrictions-btn">Restrict files</button>
    </div>
  `;
}

// Builtin catalog fallback (when proxy is not reachable for catalog)
const BUILTIN_CATALOG: CatalogProvider[] = [
  { name: "OpenAI", slug: "openai", baseUrl: "https://api.openai.com/v1", authUrl: "https://platform.openai.com/api-keys", description: "GPT-4o, o3 reasoning", models: [
    { modelName: "gpt-4o", displayName: "GPT-4o", inputCostPer1k: 0.005, outputCostPer1k: 0.015, maxContextTokens: 128000, tags: ["fast","vision"] },
    { modelName: "gpt-4o-mini", displayName: "GPT-4o mini", inputCostPer1k: 0.00015, outputCostPer1k: 0.0006, maxContextTokens: 128000, tags: ["cheap"] },
    { modelName: "o3-mini", displayName: "o3-mini", inputCostPer1k: 0.0011, outputCostPer1k: 0.0044, maxContextTokens: 200000, tags: ["reasoning"] }
  ]},
  { name: "Anthropic", slug: "anthropic", baseUrl: "https://api.anthropic.com", authUrl: "https://console.anthropic.com/settings/keys", description: "Claude 4 Opus, Sonnet", models: [
    { modelName: "claude-opus-4-6", displayName: "Claude Opus 4.6", inputCostPer1k: 0.015, outputCostPer1k: 0.075, maxContextTokens: 200000, tags: ["powerful"] },
    { modelName: "claude-sonnet-4-6", displayName: "Claude Sonnet 4.6", inputCostPer1k: 0.003, outputCostPer1k: 0.015, maxContextTokens: 200000 },
    { modelName: "claude-haiku-4-5-20251001", displayName: "Claude Haiku 4.5", inputCostPer1k: 0.0008, outputCostPer1k: 0.004, maxContextTokens: 200000, tags: ["cheap"] }
  ]},
  { name: "Google Gemini", slug: "google-gemini", baseUrl: "https://generativelanguage.googleapis.com", authUrl: "https://aistudio.google.com/app/apikey", description: "Gemini 2.5 Pro, 1M ctx", models: [
    { modelName: "gemini-2.5-pro-preview-03-25", displayName: "Gemini 2.5 Pro", inputCostPer1k: 0.00125, outputCostPer1k: 0.01, maxContextTokens: 1048576, tags: ["powerful","long-ctx"] },
    { modelName: "gemini-2.0-flash", displayName: "Gemini 2.0 Flash", inputCostPer1k: 0.0001, outputCostPer1k: 0.0004, maxContextTokens: 1048576, tags: ["fast","cheap"] }
  ]},
  { name: "Groq", slug: "groq", baseUrl: "https://api.groq.com/openai/v1", authUrl: "https://console.groq.com/keys", description: "Free Llama on ultra-fast hardware", models: [
    { modelName: "llama-3.3-70b-versatile", displayName: "Llama 3.3 70B", inputCostPer1k: 0.00059, outputCostPer1k: 0.00079, maxContextTokens: 128000 },
    { modelName: "llama-3.1-8b-instant", displayName: "Llama 3.1 8B", inputCostPer1k: 0.00005, outputCostPer1k: 0.00008, maxContextTokens: 128000, tags: ["cheap","fast"] }
  ]},
  { name: "Mistral AI", slug: "mistral", baseUrl: "https://api.mistral.ai/v1", authUrl: "https://console.mistral.ai/api-keys", description: "Codestral for code, Mistral Large", models: [
    { modelName: "codestral-latest", displayName: "Codestral", inputCostPer1k: 0.0003, outputCostPer1k: 0.0009, maxContextTokens: 256000, tags: ["code"] },
    { modelName: "mistral-large-latest", displayName: "Mistral Large", inputCostPer1k: 0.002, outputCostPer1k: 0.006, maxContextTokens: 128000 }
  ]},
  { name: "x.ai (Grok)", slug: "xai", baseUrl: "https://api.x.ai/v1", authUrl: "https://console.x.ai", description: "Grok 3 with real-time web", models: [
    { modelName: "grok-3", displayName: "Grok 3", inputCostPer1k: 0.003, outputCostPer1k: 0.015, maxContextTokens: 131072 },
    { modelName: "grok-3-mini", displayName: "Grok 3 Mini", inputCostPer1k: 0.0003, outputCostPer1k: 0.0005, maxContextTokens: 131072, tags: ["cheap"] }
  ]},
  { name: "DeepSeek", slug: "deepseek", baseUrl: "https://api.deepseek.com/v1", authUrl: "https://platform.deepseek.com/api_keys", description: "DeepSeek V3, R1 Reasoner", models: [
    { modelName: "deepseek-chat", displayName: "DeepSeek V3", inputCostPer1k: 0.00027, outputCostPer1k: 0.0011, maxContextTokens: 64000, tags: ["cheap"] },
    { modelName: "deepseek-reasoner", displayName: "DeepSeek R1", inputCostPer1k: 0.00055, outputCostPer1k: 0.00219, maxContextTokens: 64000, tags: ["reasoning"] }
  ]},
  { name: "Together AI", slug: "together", baseUrl: "https://api.together.xyz/v1", authUrl: "https://api.together.ai/settings/api-keys", description: "Open-source models", models: [
    { modelName: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", displayName: "Llama 3.1 70B Turbo", inputCostPer1k: 0.00088, outputCostPer1k: 0.00088, maxContextTokens: 131072 },
    { modelName: "deepseek-ai/DeepSeek-V3", displayName: "DeepSeek V3", inputCostPer1k: 0.00135, outputCostPer1k: 0.00135, maxContextTokens: 128000 }
  ]},
  { name: "Perplexity", slug: "perplexity", baseUrl: "https://api.perplexity.ai", authUrl: "https://www.perplexity.ai/settings/api", description: "Sonar with web search", models: [
    { modelName: "sonar-pro", displayName: "Sonar Pro", inputCostPer1k: 0.003, outputCostPer1k: 0.015, maxContextTokens: 200000, tags: ["search"] },
    { modelName: "sonar", displayName: "Sonar", inputCostPer1k: 0.001, outputCostPer1k: 0.001, maxContextTokens: 128000, tags: ["search","cheap"] }
  ]},
  { name: "Ollama (Local)", slug: "ollama", baseUrl: "http://localhost:11434", authUrl: "https://ollama.com/download", description: "Local models, fully private", models: [
    { modelName: "llama3.2", displayName: "Llama 3.2 3B", inputCostPer1k: 0, outputCostPer1k: 0, maxContextTokens: 128000, tags: ["free","local"] },
    { modelName: "qwen2.5-coder:7b", displayName: "Qwen 2.5 Coder 7B", inputCostPer1k: 0, outputCostPer1k: 0, maxContextTokens: 32768, tags: ["code","free"] }
  ]}
];

function formatCost(n: number): string {
  if (n === 0) return "free";
  if (n < 0.001) return n.toFixed(6);
  if (n < 0.01) return n.toFixed(4);
  return n.toFixed(3);
}

// ── Models ───────────────────────────────────────────────────────────────

function renderModels(): string {
  if (providers.length === 0) {
    return '<div class="empty-state" style="padding:20px">Add a provider first (go to Providers tab).</div>';
  }

  // Build registered model set for deduplication check
  const registeredModelNames = new Set(models.map((m) => m.modelName));

  // Active models grouped by provider
  const grouped = new Map<number, { provider: Provider | undefined; models: Model[] }>();
  for (const m of models) {
    if (!grouped.has(m.providerId)) {
      grouped.set(m.providerId, { provider: providers.find((p) => p.id === m.providerId), models: [] });
    }
    grouped.get(m.providerId)!.models.push(m);
  }

  let activeHtml = "";
  if (models.length > 0) {
    activeHtml += `<div class="section-title">Registered Models</div>`;
    for (const [, group] of grouped) {
      activeHtml += `<div style="font-size:10px;font-weight:600;color:var(--subtle);text-transform:uppercase;letter-spacing:.5px;margin:6px 0 3px">${esc(group.provider?.name ?? "Unknown")}</div>`;
      for (const m of group.models) {
        const costIn = formatCost(m.inputCostPer1k);
        const costOut = formatCost(m.outputCostPer1k);
        const ctx = m.maxContextTokens && m.maxContextTokens > 0 ? `${Math.round(m.maxContextTokens / 1000)}k ctx` : "";
        activeHtml += `
          <div class="model-row">
            <div class="model-row-info">
              <span class="model-row-name">${esc(m.displayName || m.modelName)}</span>
              <span class="model-row-cost">$${costIn} / $${costOut} per 1k ${ctx ? `· ${ctx}` : ""}</span>
            </div>
            <span class="model-status-dot" style="background:${m.enabled ? "var(--success)" : "var(--subtle)"}"></span>
          </div>`;
      }
    }
  }

  // Catalog section — show models from catalog for each provider that's configured
  let catalogHtml = "";
  const useSources = catalog.length > 0 ? catalog : BUILTIN_CATALOG;
  const matchedCatalogProviders = useSources.filter((cp) =>
    providers.some((p) => p.baseUrl === cp.baseUrl || p.name.toLowerCase().includes(cp.slug.split("-")[0]))
  );

  if (matchedCatalogProviders.length > 0) {
    catalogHtml += `<div class="section-title" style="margin-top:10px">Add More Models</div>`;
    for (const cp of matchedCatalogProviders) {
      const matchedProvider = providers.find((p) => p.baseUrl === cp.baseUrl || p.name.toLowerCase().includes(cp.slug.split("-")[0]));
      if (!matchedProvider) continue;
      const newModels = cp.models.filter((m) => !registeredModelNames.has(m.modelName));
      if (newModels.length === 0) continue;
      catalogHtml += `<div style="font-size:10px;font-weight:600;color:var(--subtle);text-transform:uppercase;letter-spacing:.5px;margin:6px 0 3px">${esc(cp.name)}</div>`;
      for (const m of newModels) {
        catalogHtml += `
          <div class="model-catalog-row">
            <div class="model-row-info">
              <span class="model-row-name">${esc(m.displayName)}</span>
              <span class="model-row-cost">$${formatCost(m.inputCostPer1k)} / $${formatCost(m.outputCostPer1k)} per 1k${m.maxContextTokens ? ` · ${Math.round(m.maxContextTokens / 1000)}k ctx` : ""}</span>
              ${m.tags?.length ? `<span class="model-row-tags">${m.tags.map((t) => `<span class="model-tag">${esc(t)}</span>`).join("")}</span>` : ""}
            </div>
            <button type="button" class="btn btn-secondary btn-sm catalog-add-model" data-provider-id="${matchedProvider.id}" data-model='${JSON.stringify({ modelName: m.modelName, displayName: m.displayName, inputCostPer1k: m.inputCostPer1k, outputCostPer1k: m.outputCostPer1k, maxContextTokens: m.maxContextTokens })}'>+ Add</button>
          </div>`;
      }
    }
  }

  // Manual add form
  const provOpts = providers.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join("");
  const manualForm = `
    <div class="section-title" style="margin-top:10px">Manual Add</div>
    <div class="form-group"><label>Provider</label><select id="model-provider">${provOpts}</select></div>
    <div class="form-group"><label>Model ID</label><input type="text" id="model-name" placeholder="e.g. gpt-4o-mini" /></div>
    <div style="display:flex;gap:8px">
      <div class="form-group" style="flex:1"><label>Input $/1k</label><input type="number" id="model-input-cost" step="0.0001" value="0" /></div>
      <div class="form-group" style="flex:1"><label>Output $/1k</label><input type="number" id="model-output-cost" step="0.0001" value="0" /></div>
    </div>
    <button type="button" class="btn btn-primary btn-sm" id="add-model-btn">Add</button>
  `;

  return activeHtml + catalogHtml + manualForm;
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

// ── MCP Server Management ────────────────────────────────────────────────

function renderMcp(): string {
  const statusDot = (online?: boolean) =>
    online === true
      ? `<span style="color:var(--ok);font-size:10px">● online</span>`
      : online === false
        ? `<span style="color:var(--err);font-size:10px">● offline</span>`
        : `<span style="color:var(--subtle);font-size:10px">● unknown</span>`;

  return `
    <div class="section-title">MCP Servers</div>
    <div style="font-size:11px;color:var(--subtle);margin-bottom:10px">
      Model Context Protocol servers provide tools (file I/O, git, database, etc.) to the LLM.
      All traffic is scanned by the AI Firewall before being forwarded.
    </div>

    ${mcpServers.length === 0
      ? `<div class="empty-state" style="margin-bottom:12px">No MCP servers configured. Add one below.</div>`
      : mcpServers.map((s) => `
        <div class="card" style="margin-bottom:6px">
          <div class="card-header">
            <span class="card-title">${esc(s.name)}</span>
            ${statusDot(s.online)}
          </div>
          <div style="font-size:11px;color:var(--subtle);margin-bottom:6px">${esc(s.targetUrl)}</div>
          <button type="button" class="btn btn-secondary btn-sm mcp-delete-btn" data-name="${esc(s.name)}">Remove</button>
        </div>
      `).join("")}

    <div class="section-title" style="margin-top:14px">Add Server</div>
    <div class="form-group">
      <label>Name</label>
      <input type="text" id="mcp-name-input" placeholder="e.g. filesystem" value="${esc(mcpNewName)}" />
    </div>
    <div class="form-group">
      <label>Target URL</label>
      <input type="text" id="mcp-url-input" placeholder="http://localhost:3001" value="${esc(mcpNewUrl)}" />
    </div>
    <button type="button" class="btn btn-primary" id="mcp-add-btn">Add Server</button>

    <div class="section-title" style="margin-top:18px">What are MCP Servers?</div>
    <div style="font-size:11px;color:var(--subtle);line-height:1.6">
      MCP servers run locally and expose tools (read_file, write_file, list_dir, run_query, etc.)
      that the AI can call to complete tasks — just like Copilot or Cursor.<br><br>
      <b>BYOK keys are not needed for MCP servers</b> — only LLM providers (OpenAI, Anthropic, etc.) use API keys.
      MCP servers are local processes that respond to JSON-RPC calls.<br><br>
      Popular servers: <b>filesystem</b> (file read/write), <b>git</b> (commits, diffs), <b>database</b> (SQL queries).
    </div>
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
      if (currentTab === "mcp") { vscode.postMessage({ type: "loadMcpServers" }); }
      render();
    });
  });

  const modelSelect = document.getElementById("model-select") as HTMLSelectElement | null;
  modelSelect?.addEventListener("change", () => { selectedModel = modelSelect.value; });

  const chatInput = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  const sendBtn = document.getElementById("send-btn") as HTMLButtonElement | null;

  chatInput?.addEventListener("keydown", (e) => {
    // Mention dropdown navigation takes priority
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

  // Provider tile clicks — enter setup flow
  document.querySelectorAll<HTMLButtonElement>(".provider-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      setupProviderSlug = btn.dataset.slug ?? "";
      setupApiKey = "";
      const useSources = catalog.length > 0 ? catalog : BUILTIN_CATALOG;
      const entry = useSources.find((c) => c.slug === setupProviderSlug);
      // Pre-select all models
      selectedCatalogModels = new Set(entry?.models.map((m) => m.modelName) ?? []);
      render();
    });
  });

  document.getElementById("back-to-catalog-btn")?.addEventListener("click", () => {
    setupProviderSlug = "";
    render();
  });
  document.getElementById("back-to-catalog-btn2")?.addEventListener("click", () => {
    setupProviderSlug = "";
    render();
  });

  // Catalog model checkboxes
  document.querySelectorAll<HTMLInputElement>(".catalog-model-check").forEach((cb) => {
    cb.addEventListener("change", () => {
      let modelData: { modelName: string } | null = null;
      try { modelData = JSON.parse(cb.dataset.model ?? "null"); } catch { /* ignore */ }
      if (!modelData) return;
      if (cb.checked) {
        selectedCatalogModels.add(modelData.modelName);
      } else {
        selectedCatalogModels.delete(modelData.modelName);
      }
    });
  });

  document.getElementById("setup-api-key")?.addEventListener("input", (e) => {
    setupApiKey = (e.target as HTMLInputElement).value;
  });

  document.getElementById("confirm-add-provider-btn")?.addEventListener("click", () => {
    const useSources = catalog.length > 0 ? catalog : BUILTIN_CATALOG;
    const entry = useSources.find((c) => c.slug === setupProviderSlug);
    if (!entry) return;
    const isOllama = entry.slug === "ollama";
    const apiKey = isOllama ? "ollama-local" : setupApiKey.trim();
    if (!isOllama && !apiKey) { showToast("Please enter an API key."); return; }
    const chosenModels = entry.models.filter((m) => selectedCatalogModels.has(m.modelName));
    if (chosenModels.length === 0) { showToast("Select at least one model."); return; }
    vscode.postMessage({ type: "addProviderWithModels", provider: { name: entry.name, apiKey, baseUrl: entry.baseUrl }, models: chosenModels });
    setupProviderSlug = "";
    setupApiKey = "";
    selectedCatalogModels = new Set();
    render();
  });

  // Catalog quick-add model buttons (Models tab)
  document.querySelectorAll<HTMLButtonElement>(".catalog-add-model").forEach((btn) => {
    btn.addEventListener("click", () => {
      const providerId = Number(btn.dataset.providerId);
      let modelData: CatalogModel | null = null;
      try { modelData = JSON.parse(btn.dataset.model ?? "null"); } catch { /* ignore */ }
      if (!modelData) return;
      vscode.postMessage({ type: "addModel", providerId, modelName: modelData.modelName, displayName: modelData.displayName, inputCostPer1k: modelData.inputCostPer1k, outputCostPer1k: modelData.outputCostPer1k });
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

  document.getElementById("clear-chat-btn")?.addEventListener("click", () => clearChat());

  // ── MCP Server management events ──────────────────────────────────────
  document.getElementById("mcp-add-btn")?.addEventListener("click", () => {
    const nameEl = document.getElementById("mcp-name-input") as HTMLInputElement | null;
    const urlEl  = document.getElementById("mcp-url-input")  as HTMLInputElement | null;
    const name = nameEl?.value.trim() ?? "";
    const targetUrl = urlEl?.value.trim() ?? "";
    if (!name || !targetUrl) { return; }
    mcpNewName = "";
    mcpNewUrl  = "";
    vscode.postMessage({ type: "addMcpServer", name, targetUrl });
  });

  document.getElementById("mcp-name-input")?.addEventListener("input", (e) => {
    mcpNewName = (e.target as HTMLInputElement).value;
  });
  document.getElementById("mcp-url-input")?.addEventListener("input", (e) => {
    mcpNewUrl = (e.target as HTMLInputElement).value;
  });

  document.querySelectorAll<HTMLButtonElement>(".mcp-delete-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.name ?? "";
      if (name) vscode.postMessage({ type: "deleteMcpServer", name });
    });
  });

  // Image preview remove buttons
  document.querySelectorAll<HTMLButtonElement>(".preview-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.imgIdx);
      pendingImages = pendingImages.filter((_, i) => i !== idx);
      render();
    });
  });

  // File chip remove buttons
  document.querySelectorAll<HTMLButtonElement>(".file-chip-x").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.fileIdx);
      const allFiles = [...pendingFilePaths, ...pendingBypassedPaths];
      allFiles.splice(idx, 1);
      pendingFilePaths = allFiles.slice(0, pendingFilePaths.length > idx ? pendingFilePaths.length - 1 : pendingFilePaths.length);
      pendingBypassedPaths = allFiles.slice(pendingFilePaths.length);
      render();
    });
  });

  // Keyboard shortcut: Ctrl+Shift+K = clear chat (mirrors VS Code / Copilot)
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "K") {
      e.preventDefault();
      clearChat();
    }
  }, { once: true }); // re-registered on every render via bindEvents

  // Agent mode toggle
  document.getElementById("agent-mode-toggle")?.addEventListener("change", (e) => {
    agentMode = (e.target as HTMLInputElement).checked;
    if (!agentMode) autoApplyOps = false;
    render();
  });

  document.getElementById("auto-apply-toggle")?.addEventListener("change", (e) => {
    autoApplyOps = (e.target as HTMLInputElement).checked;
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

  // Remove @query from the textarea without a full re-render
  const input = document.getElementById("chat-input") as HTMLTextAreaElement | null;
  if (input && mentionAtStart !== -1) {
    const cur = input.selectionStart ?? 0;
    input.value = input.value.slice(0, mentionAtStart) + input.value.slice(cur);
    input.setSelectionRange(mentionAtStart, mentionAtStart);
  }

  mentionDropdownVisible = false;
  mentionAtStart = -1;
  mentionDropdownResults = [];

  // Remove dropdown from DOM without re-rendering the full page (preserves focus)
  document.getElementById("mention-dropdown")?.remove();

  // Update chip bar surgically
  updateMentionChips();
  input?.focus();
}

function updateMentionChips(): void {
  const container = document.getElementById("mention-chips");
  if (!container && mentionedFiles.length === 0) return;

  if (mentionedFiles.length === 0) {
    container?.remove();
    return;
  }

  const html = mentionedFiles.map((f, i) =>
    `<span class="mention-chip" data-idx="${i}">@${esc(f)}<button class="mention-chip-x" data-idx="${i}" aria-label="Remove ${esc(f)}" title="Remove">×</button></span>`
  ).join("");

  if (container) {
    container.innerHTML = html;
  } else {
    // Create the chip bar just before the input row
    const inputRow = document.querySelector(".chat-input-row");
    if (inputRow) {
      const div = document.createElement("div");
      div.id = "mention-chips";
      div.className = "mention-chips";
      div.innerHTML = html;
      inputRow.parentElement?.insertBefore(div, inputRow);
    }
  }

  // Re-bind chip remove buttons
  document.querySelectorAll<HTMLButtonElement>(".mention-chip-x").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      mentionedFiles = mentionedFiles.filter((_, i) => i !== idx);
      updateMentionChips();
    });
  });
}

/** Typewriter animation: progressively reveals content then does final markdown render */
function startTypewriter(fullContent: string, modelUsed: string): void {
  if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }

  const msgs = document.getElementById("chat-messages");
  if (!msgs) {
    chatHistory.push({ role: "assistant", content: fullContent });
    if (modelUsed) chatHistory.push({ role: "system", content: `↳ ${modelUsed}` });
    render();
    (document.getElementById("chat-input") as HTMLTextAreaElement | null)?.focus();
    return;
  }

  // Remove loading indicators
  document.querySelector(".phase-indicator")?.remove();
  document.querySelector(".typing-indicator")?.remove();

  // Create streaming placeholder
  const div = document.createElement("div");
  div.className = "msg assistant";
  div.setAttribute("role", "article");
  div.setAttribute("aria-label", "Assistant message");
  div.innerHTML = `<div class="markdown-preview"><span id="stream-text-live" style="white-space:pre-wrap"></span><span class="stream-cursor" aria-hidden="true">▋</span></div>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;

  let pos = 0;
  typewriterTimer = setInterval(() => {
    if (pos >= fullContent.length) {
      clearInterval(typewriterTimer!);
      typewriterTimer = null;
      div.remove();
      chatHistory.push({ role: "assistant", content: fullContent });
      if (modelUsed) chatHistory.push({ role: "system", content: `↳ ${modelUsed}` });
      render();
      announce(`Response received from ${modelUsed || "assistant"}`);
      (document.getElementById("chat-input") as HTMLTextAreaElement | null)?.focus();
      return;
    }
    const chunkSize = Math.floor(Math.random() * 10) + 3;
    pos = Math.min(pos + chunkSize, fullContent.length);
    const el = document.getElementById("stream-text-live");
    if (el) el.textContent = fullContent.slice(0, pos);
    msgs.scrollTop = msgs.scrollHeight;
  }, 12);
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
  pendingImages = [];
  mentionedFiles = [];
  render();
  // Re-focus the textarea after render so the user can type again immediately
  (document.getElementById("chat-input") as HTMLTextAreaElement | null)?.focus();
  vscode.postMessage({ type: "chat", model: selectedModel, messages, filePaths: allFilePaths, bypassedFilePaths: bypassedPaths });
}

function clearChat(): void {
  chatHistory = [];
  pendingEstimate = null;
  pendingMessages = [];
  pendingFilePaths = [];
  pendingBypassedPaths = [];
  pendingImages = [];
  mentionedFiles = [];
  pendingFileOps = [];
  render();
  announce("Conversation cleared");
  (document.getElementById("chat-input") as HTMLTextAreaElement | null)?.focus();
}

/** Post a message to the sr-only live region so screen readers announce it */
function announce(text: string): void {
  const el = document.getElementById("a11y-announce");
  if (el) { el.textContent = ""; requestAnimationFrame(() => { el.textContent = text; }); }
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
      <div class="code-block-wrapper" role="region" aria-label="${esc(lang)} code block">
        <div class="code-block-header">
          <span class="code-block-lang" aria-hidden="true">${esc(lang)}</span>
          <div class="code-block-actions" role="group" aria-label="Code actions">
            <button type="button" class="btn btn-sm btn-primary cb-insert" data-id="${blockId}" title="Insert at cursor" aria-label="Insert ${esc(lang)} code at cursor">Insert</button>
            <button type="button" class="btn btn-sm btn-secondary cb-replace" data-id="${blockId}" title="Replace selection" aria-label="Replace selection with ${esc(lang)} code">Replace</button>
            <button type="button" class="btn btn-sm btn-secondary cb-copy" data-id="${blockId}" title="Copy to clipboard" aria-label="Copy ${esc(lang)} code">Copy</button>
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
        vscode.postMessage({ type: "loadCatalog" });
      }
      render();
      break;

    case "estimateResult":
      isLoading = false;
      pendingEstimate = msg.data as EstResult;
      render();
      break;

    // ── Real streaming: open a new assistant bubble ───────────────────────
    case "chatStreamStart": {
      if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
      streamingActive = true;
      streamingAccum = "";

      // Remove phase/typing indicators
      document.querySelector(".phase-indicator")?.remove();
      document.querySelector(".typing-indicator")?.remove();

      const msgs = document.getElementById("chat-messages");
      if (msgs) {
        streamingDiv = document.createElement("div");
        streamingDiv.className = "msg assistant";
        streamingDiv.setAttribute("role", "article");
        streamingDiv.innerHTML =
          `<div class="markdown-preview"><span id="stream-text-live" style="white-space:pre-wrap"></span>` +
          `<span class="stream-cursor" aria-hidden="true">▋</span></div>`;
        msgs.appendChild(streamingDiv);
        msgs.scrollTop = msgs.scrollHeight;
      }
      break;
    }

    // ── Real streaming: append incoming delta directly to DOM ─────────────
    case "chatChunk": {
      const delta = (msg.text ?? "") as string;
      streamingAccum += delta;
      const liveEl = document.getElementById("stream-text-live");
      if (liveEl) {
        liveEl.textContent = streamingAccum;
        const msgs = document.getElementById("chat-messages");
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
      }
      break;
    }

    // ── Real streaming: finalise bubble with proper markdown ─────────────
    case "chatStreamDone": {
      streamingActive = false;
      isLoading = false;

      if (streamingDiv) {
        streamingDiv.remove();
        streamingDiv = null;
      }

      // Push accumulated content into history and re-render with markdown
      const finalContent = streamingAccum;
      streamingAccum = "";
      if (finalContent) {
        chatHistory.push({ role: "assistant", content: finalContent });
      }
      render();
      (document.getElementById("chat-input") as HTMLTextAreaElement | null)?.focus();
      break;
    }

    case "chatResponse": {
      currentPhase = "done";
      currentPhaseLabel = "";
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

      // If streaming already rendered the content, just append metadata note
      if (fw?.model_used) {
        // Avoid re-pushing if chatStreamDone already pushed the content
        const lastMsg = chatHistory[chatHistory.length - 1];
        const alreadyStreamed = lastMsg?.role === "assistant" &&
          resp.choices?.[0]?.message?.content &&
          lastMsg.content === resp.choices[0].message.content;

        if (!alreadyStreamed) {
          const content = resp.choices?.[0]?.message?.content ?? "(no response)";
          isLoading = false;
          startTypewriter(content, fw.model_used ?? selectedModel);
        } else {
          // Just append the model attribution line
          chatHistory.push({ role: "system", content: `↳ ${fw.model_used}` });
          render();
        }
      } else {
        const content = resp.choices?.[0]?.message?.content ?? "(no response)";
        isLoading = false;
        startTypewriter(content, selectedModel);
      }
      break;
    }

    case "agentPhase": {
      currentPhase = msg.phase as string;
      currentPhaseLabel = msg.label as string;
      // Surgical update — avoid full re-render while loading
      const phaseIcons: Record<string, string> = {
        thinking: "🧠", reading: "📖", writing: "✍️", applying: "📝", running: "▶️", done: ""
      };
      const labelEl = document.querySelector<HTMLElement>(".phase-indicator .phase-label");
      const iconEl = document.querySelector<HTMLElement>(".phase-indicator .phase-icon");
      if (labelEl && iconEl) {
        labelEl.textContent = currentPhaseLabel || "Thinking…";
        iconEl.textContent = phaseIcons[currentPhase] ?? "🧠";
      } else {
        render();
      }
      break;
    }

    case "commandOutput": {
      const cmd = msg.command as string;
      const output = msg.output as string;
      const exitCode = msg.exitCode as number;
      const statusIcon = exitCode === 0 ? "✅" : "❌";
      chatHistory.push({ role: "system", content: `${statusIcon} \`${cmd}\`\n\`\`\`\n${output || "(no output)"}\n\`\`\`` });
      render();
      break;
    }

    case "chatError":
      isLoading = false;
      currentPhase = "";
      currentPhaseLabel = "";
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
          const defaultValid = configuredDefaultModel && enabled.some((m) => m.modelName === configuredDefaultModel);
          selectedModel = defaultValid ? configuredDefaultModel : enabled[0].modelName;
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

    case "catalog": {
      catalog = (msg.data as CatalogProvider[]) ?? [];
      render();
      break;
    }

    case "attachedFiles": {
      pendingFilePaths = (msg.safeFiles as string[]) ?? [];
      pendingBypassedPaths = (msg.bypassedFiles as string[]) ?? [];
      pendingImages = (msg.imageFiles as { name: string; dataUrl: string }[]) ?? [];
      render();
      break;
    }

    case "mentionSearchResults": {
      mentionDropdownResults = (msg.results as string[]) ?? [];
      mentionDropdownIdx = 0;
      // Surgical dropdown update — never re-render the full page while the user is typing.
      // Instead, find or create the dropdown element and patch it in place.
      const inputEl = document.getElementById("chat-input") as HTMLTextAreaElement | null;
      const inputParent = inputEl?.parentElement ?? null;
      let dd = document.getElementById("mention-dropdown");

      if (mentionDropdownResults.length === 0) {
        // No results — remove dropdown if present
        dd?.remove();
        mentionDropdownVisible = false;
      } else {
        const optHtml = mentionDropdownResults.map((f, i) =>
          `<div class="mention-option ${i === mentionDropdownIdx ? "selected" : ""}" role="option" aria-selected="${i === mentionDropdownIdx}" data-idx="${i}" data-path="${esc(f)}">${esc(f)}</div>`
        ).join("");

        if (!dd && inputParent) {
          // Create dropdown for the first time
          dd = document.createElement("div");
          dd.id = "mention-dropdown";
          dd.className = "mention-dropdown";
          dd.setAttribute("role", "listbox");
          dd.setAttribute("aria-label", "File suggestions");
          inputParent.insertBefore(dd, inputEl);
        }
        if (dd) {
          dd.innerHTML = optHtml;
          dd.querySelectorAll<HTMLDivElement>(".mention-option").forEach((el) => {
            el.addEventListener("mousedown", (e) => { e.preventDefault(); acceptMentionOption(el.dataset.path ?? ""); });
          });
        }
      }
      break;
    }

    case "fileOperations": {
      const ops = (msg.operations as FileOp[]) ?? [];
      if (ops.length > 0) {
        if (autoApplyOps && agentMode) {
          // Auto-apply mode: send all ops directly to extension without showing diff modal
          vscode.postMessage({ type: "applyAllFileOps", operations: ops.map((op) => ({ opType: op.type, filePath: op.path, content: op.content })) });
          pendingFileOps = [];
        } else {
          pendingFileOps = ops;
        }
        render();
      }
      break;
    }

    case "mcpServers": {
      mcpServers = (msg.data as McpServer[]) ?? [];
      render();
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
