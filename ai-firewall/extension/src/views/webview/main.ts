declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface VsMessage {
  type: string;
  [key: string]: unknown;
}

const vscode = acquireVsCodeApi();

// ── State ──────────────────────────────────────────────────────────────

type ChatMsg = { role: string; content: string };
type Provider = { id: number; name: string; slug: string; baseUrl: string; enabled: boolean };
type Model = { id: number; providerId: number; modelName: string; displayName: string; inputCostPer1k: number; outputCostPer1k: number; enabled: boolean };
type Credit = { id: number; providerId: number | null; limitType: string; totalLimit: number; usedAmount: number; resetPeriod: string; resetDate: number; hardLimit: boolean };
type EstResult = {
  estimatedInputTokens: number;
  estimatedCost: number;
  creditRemaining: number;
  creditLimitType: string;
  scan: { action: string; secretsFound: number; piiFound: number; filesBlocked: string[]; riskScore: number; reasons: string[] };
  model: { name: string; displayName: string; provider: string; registered: boolean };
};
type UsageSummary = { totalRequests: number; totalTokens: number; totalCost: number; byModel: Array<{ modelName: string; requests: number; tokens: number; cost: number }> };

let currentTab = "chat";
let connected = false;
let chatHistory: ChatMsg[] = [];
let selectedModel = "gpt-4";
let providers: Provider[] = [];
let models: Model[] = [];
let credits: Credit[] = [];
let usage: UsageSummary = { totalRequests: 0, totalTokens: 0, totalCost: 0, byModel: [] };
let pendingEstimate: EstResult | null = null;
let pendingMessages: ChatMsg[] = [];
let pendingFilePaths: string[] = [];
let isLoading = false;
let showPreFlight = true;
let toastMsg = "";
let toastTimer: ReturnType<typeof setTimeout> | undefined;

// ── Rendering ──────────────────────────────────────────────────────────

function render(): void {
  const app = document.getElementById("app")!;
  app.innerHTML = `
    ${renderConnectionBar()}
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
    ${toastMsg ? `<div class="toast">${esc(toastMsg)}</div>` : ""}
  `;
  bindEvents();
}

function renderConnectionBar(): string {
  if (connected) {
    return `<div class="connection-bar ok">Connected to AI Firewall proxy</div>`;
  }
  return `<div class="connection-bar err">Cannot reach proxy — start the server</div>`;
}

function renderTab(id: string, label: string): string {
  return `<button class="tab ${currentTab === id ? "active" : ""}" data-tab="${id}">${label}</button>`;
}

// ── Chat ────────────────────────────────────────────────────────────────

function renderChat(): string {
  const modelOpts = models.filter((m) => m.enabled).map((m) =>
    `<option value="${esc(m.modelName)}" ${m.modelName === selectedModel ? "selected" : ""}>${esc(m.displayName || m.modelName)}</option>`
  ).join("");

  const fallbackOpt = models.length === 0
    ? `<option value="${esc(selectedModel)}" selected>${esc(selectedModel)}</option>`
    : "";

  let msgs = chatHistory.map((m) => {
    if (m.role === "assistant") {
      return `<div class="msg assistant">${renderAssistantContent(m.content)}</div>`;
    }
    return `<div class="msg ${m.role}">${esc(m.content)}</div>`;
  }).join("");
  if (isLoading) {
    msgs += `<div class="msg system"><span class="spinner"></span> Waiting for response...</div>`;
  }

  const preflightHtml = pendingEstimate ? renderPreFlight(pendingEstimate) : "";

  return `
    <div class="model-selector">
      <label style="font-size:11px;color:var(--subtle)">Model:</label>
      <select id="model-select">${fallbackOpt}${modelOpts}</select>
    </div>
    <div class="chat-messages" id="chat-messages">${msgs || '<div class="empty-state">Start a conversation with AI.<br/>Your requests are scanned and cost-estimated before sending.</div>'}</div>
    ${preflightHtml}
    <div class="chat-input-row">
      <textarea class="chat-input" id="chat-input" placeholder="Type your message..." rows="1"></textarea>
      <button class="btn btn-primary" id="send-btn" ${isLoading ? "disabled" : ""}>Send</button>
    </div>
  `;
}

function renderPreFlight(est: EstResult): string {
  const actionClass = est.scan.action.toLowerCase();
  const creditStr = est.creditRemaining === -1 ? "unlimited" : est.creditRemaining.toLocaleString();

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
      ${est.scan.action === "BLOCK" ? `<div style="color:var(--error);margin-top:6px;font-size:11px">This request will be blocked: ${esc(est.scan.reasons.join(", "))}</div>` : ""}
      <div class="pf-actions">
        ${est.scan.action !== "BLOCK" ? `<button class="btn btn-primary btn-sm" id="pf-confirm">Send</button>` : ""}
        <button class="btn btn-secondary btn-sm" id="pf-cancel">Cancel</button>
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
        <button class="btn btn-secondary btn-sm toggle-provider" data-id="${p.id}" data-enabled="${p.enabled ? "1" : "0"}">${p.enabled ? "Disable" : "Enable"}</button>
        <button class="btn btn-danger btn-sm delete-provider" data-id="${p.id}">Delete</button>
      </div>
    </div>
  `).join("");

  return `
    <div class="section-title">Your Providers</div>
    ${list || '<div class="empty-state">No providers configured yet.<br/>Add one below to get started.</div>'}
    <div class="section-title">Add Provider</div>
    <div class="form-group"><label>Name (e.g. OpenAI, Anthropic)</label><input type="text" id="prov-name" placeholder="OpenAI" /></div>
    <div class="form-group"><label>API Key</label><input type="password" id="prov-key" placeholder="sk-..." /></div>
    <div class="form-group"><label>Base URL</label><input type="url" id="prov-url" placeholder="https://api.openai.com/v1" /></div>
    <button class="btn btn-primary" id="add-provider-btn">Add Provider</button>
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
      <div class="form-group"><label>Model Name (e.g. gpt-4)</label><input type="text" id="model-name" placeholder="gpt-4" /></div>
      <div class="form-group"><label>Input Cost / 1k tokens</label><input type="number" id="model-input-cost" step="0.0001" value="0" /></div>
      <div class="form-group"><label>Output Cost / 1k tokens</label><input type="number" id="model-output-cost" step="0.0001" value="0" /></div>
      <button class="btn btn-primary" id="add-model-btn">Add Model</button>
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
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentTab = btn.dataset.tab!;
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
  });

  sendBtn?.addEventListener("click", triggerSend);

  document.getElementById("pf-confirm")?.addEventListener("click", confirmSend);
  document.getElementById("pf-cancel")?.addEventListener("click", () => {
    pendingEstimate = null;
    pendingMessages = [];
    render();
  });

  // Provider buttons
  document.getElementById("add-provider-btn")?.addEventListener("click", () => {
    const name = (document.getElementById("prov-name") as HTMLInputElement).value.trim();
    const apiKey = (document.getElementById("prov-key") as HTMLInputElement).value.trim();
    const baseUrl = (document.getElementById("prov-url") as HTMLInputElement).value.trim();
    if (!name || !apiKey || !baseUrl) { return; }
    vscode.postMessage({ type: "addProvider", name, apiKey, baseUrl });
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

function triggerSend(): void {
  const input = document.getElementById("chat-input") as HTMLTextAreaElement;
  const text = input?.value.trim();
  if (!text || isLoading) { return; }

  const userMsg: ChatMsg = { role: "user", content: text };
  chatHistory.push(userMsg);
  input.value = "";

  const messages = [...chatHistory];
  pendingMessages = messages;
  pendingFilePaths = [];

  if (showPreFlight) {
    vscode.postMessage({ type: "estimate", model: selectedModel, messages, filePaths: pendingFilePaths });
    isLoading = true;
    render();
  } else {
    sendDirectly(messages);
  }
}

function confirmSend(): void {
  pendingEstimate = null;
  sendDirectly(pendingMessages);
}

function sendDirectly(messages: ChatMsg[]): void {
  isLoading = true;
  render();
  vscode.postMessage({ type: "chat", model: selectedModel, messages, filePaths: pendingFilePaths });
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

let codeBlockCounter = 0;
const codeBlockStore = new Map<string, string>();

function renderAssistantContent(content: string): string {
  const parts: string[] = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(esc(content.slice(lastIndex, match.index)));
    }

    const lang = match[1] || "code";
    const code = match[2];
    const blockId = `cb-${codeBlockCounter++}`;
    codeBlockStore.set(blockId, code);

    parts.push(`
      <div class="code-block-wrapper">
        <div class="code-block-header">
          <span class="code-block-lang">${esc(lang)}</span>
          <div class="code-block-actions">
            <button class="btn btn-sm btn-primary cb-insert" data-id="${blockId}" title="Insert at cursor">Insert</button>
            <button class="btn btn-sm btn-secondary cb-replace" data-id="${blockId}" title="Replace selection">Replace</button>
            <button class="btn btn-sm btn-secondary cb-copy" data-id="${blockId}" title="Copy to clipboard">Copy</button>
          </div>
        </div>
        <pre class="code-block-pre"><code>${esc(code)}</code></pre>
      </div>
    `);

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(esc(content.slice(lastIndex)));
  }

  return parts.join("");
}

// ── Message handler ─────────────────────────────────────────────────────

window.addEventListener("message", (event) => {
  const msg = event.data as VsMessage;

  switch (msg.type) {
    case "config": {
      const data = msg.data as { defaultModel?: string; showPreFlight?: boolean };
      if (data.defaultModel) { selectedModel = data.defaultModel; }
      if (data.showPreFlight !== undefined) { showPreFlight = data.showPreFlight; }
      render();
      break;
    }

    case "connectionStatus":
      connected = msg.connected as boolean;
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
        _firewall?: Record<string, unknown>;
      };
      const content = resp.choices?.[0]?.message?.content ?? "(no response)";
      chatHistory.push({ role: "assistant", content });
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

    case "models":
      models = (msg.data as Model[]) ?? [];
      render();
      break;

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

render();
vscode.postMessage({ type: "ready" });
