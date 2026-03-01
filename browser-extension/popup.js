function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function sourceLabel(source) {
  const labels = {
    "chatgpt-web": "ChatGPT",
    "claude-web": "Claude",
    "gemini-web": "Gemini",
    "openai-api": "OpenAI API",
    "anthropic-api": "Anthropic API",
    "gemini-api": "Gemini API"
  };
  return labels[source] || source;
}

function actionLabel(action) {
  const labels = {
    BLOCK: "Blocked",
    REDACT: "Redacted",
    ALLOW: "Allowed",
    PROXY_OFFLINE: "Unscanned"
  };
  return labels[action] || action;
}

function actionClass(action) {
  return (action || "").toLowerCase().replace("proxy_offline", "offline");
}

function initTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      const panelId = `panel-${tab.dataset.tab}`;
      document.getElementById(panelId)?.classList.add("active");

      if (tab.dataset.tab === "activity") loadActivity();
      if (tab.dataset.tab === "settings") loadSettings();
    });
  });
}

async function loadStatus() {
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "checkHealth" }, resolve);
  });

  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");

  if (res?.healthy) {
    dot.classList.add("ok");
    dot.classList.remove("err");
    text.textContent = "Proxy running — intercepting AI traffic";
  } else {
    dot.classList.add("err");
    dot.classList.remove("ok");
    text.textContent = "Proxy offline — requests sent unscanned";
  }
}

async function loadStats() {
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getStats" }, resolve);
  });

  if (!res?.stats) return;

  document.getElementById("stat-blocked").textContent = res.stats.blocked;
  document.getElementById("stat-redacted").textContent = res.stats.redacted;
  document.getElementById("stat-allowed").textContent = res.stats.allowed;
  document.getElementById("stat-total").textContent = res.stats.total;
  document.getElementById("stat-secrets").textContent = res.stats.secretsFound;
  document.getElementById("stat-pii").textContent = res.stats.piiFound;
}

async function loadActivity() {
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getRecent" }, resolve);
  });

  const list = document.getElementById("activity-list");
  const items = res?.recentActivity || [];

  if (items.length === 0) {
    list.innerHTML = '<div class="empty-state">No activity yet.<br/>Visit an AI chat site to start monitoring.</div>';
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
    <div class="activity-item">
      <div class="activity-badge ${actionClass(item.action)}"></div>
      <div class="activity-body">
        <div class="activity-source">${actionLabel(item.action)} — ${sourceLabel(item.source)}</div>
        <div class="activity-detail">${
          item.reasons?.length
            ? item.reasons.join(", ")
            : item.action === "ALLOW"
              ? "No issues found"
              : item.action === "PROXY_OFFLINE"
                ? "Proxy was unreachable"
                : ""
        }${
          item.secretsFound || item.piiFound
            ? ` · ${item.secretsFound} secrets, ${item.piiFound} PII`
            : ""
        }</div>
      </div>
      <div class="activity-time">${formatTime(item.timestamp)}</div>
    </div>
  `
    )
    .join("");
}

async function loadSettings() {
  const res = await new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "getSettings" }, resolve);
  });

  const input = document.getElementById("proxy-url");
  if (res?.proxyUrl) input.value = res.proxyUrl;
}

function initSettings() {
  document.getElementById("save-settings")?.addEventListener("click", () => {
    const proxyUrl = document.getElementById("proxy-url").value.trim();
    if (!proxyUrl) return;
    chrome.runtime.sendMessage({ type: "saveSettings", proxyUrl });
    loadStatus();
  });

  document.getElementById("clear-stats")?.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "clearStats" });
    loadStats();
    loadActivity();
  });
}

async function init() {
  initTabs();
  initSettings();
  await Promise.all([loadStatus(), loadStats()]);
}

init();
