const DEFAULT_PROXY_URL = "http://localhost:8080";

let stats = {
  total: 0,
  allowed: 0,
  blocked: 0,
  redacted: 0,
  proxyOffline: 0,
  secretsFound: 0,
  piiFound: 0
};

let recentActivity = [];
let proxyHealthy = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["stats", "recentActivity", "proxyUrl"], (data) => {
    if (data.stats) stats = data.stats;
    if (data.recentActivity) recentActivity = data.recentActivity;
    if (!data.proxyUrl) {
      chrome.storage.local.set({ proxyUrl: DEFAULT_PROXY_URL });
    }
  });
  checkHealth();
});

chrome.alarms.create("healthCheck", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "healthCheck") checkHealth();
});

async function getProxyUrl() {
  return new Promise((resolve) => {
    chrome.storage.local.get("proxyUrl", (data) => {
      resolve(data.proxyUrl || DEFAULT_PROXY_URL);
    });
  });
}

async function checkHealth() {
  try {
    const proxyUrl = await getProxyUrl();
    const res = await fetch(`${proxyUrl}/health`, {
      signal: AbortSignal.timeout(3000)
    });
    proxyHealthy = res.ok;
  } catch {
    proxyHealthy = false;
  }

  if (proxyHealthy) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#16a34a" });
  } else {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
  }
}

function recordScanResult(detail) {
  stats.total++;

  switch (detail.action) {
    case "ALLOW":
      stats.allowed++;
      break;
    case "BLOCK":
      stats.blocked++;
      break;
    case "REDACT":
      stats.redacted++;
      break;
    case "PROXY_OFFLINE":
      stats.proxyOffline++;
      break;
  }

  stats.secretsFound += detail.secretsFound || 0;
  stats.piiFound += detail.piiFound || 0;

  recentActivity.unshift({
    action: detail.action,
    source: detail.source || "unknown",
    url: detail.url || "",
    secretsFound: detail.secretsFound || 0,
    piiFound: detail.piiFound || 0,
    riskScore: detail.riskScore || 0,
    reasons: detail.reasons || [],
    timestamp: Date.now()
  });

  if (recentActivity.length > 100) {
    recentActivity = recentActivity.slice(0, 100);
  }

  chrome.storage.local.set({ stats, recentActivity });

  if (detail.action === "BLOCK") {
    chrome.action.setBadgeText({ text: String(stats.blocked) });
    chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
    setTimeout(checkHealth, 3000);
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  switch (msg.type) {
    case "scanResult":
      recordScanResult(msg.detail);
      sendResponse({ ok: true });
      return false;

    case "getStats":
      sendResponse({ stats, proxyHealthy });
      return false;

    case "getRecent":
      sendResponse({ recentActivity: recentActivity.slice(0, 30) });
      return false;

    case "checkHealth":
      checkHealth().then(() => sendResponse({ healthy: proxyHealthy }));
      return true;

    case "clearStats":
      stats = {
        total: 0,
        allowed: 0,
        blocked: 0,
        redacted: 0,
        proxyOffline: 0,
        secretsFound: 0,
        piiFound: 0
      };
      recentActivity = [];
      chrome.storage.local.set({ stats, recentActivity });
      sendResponse({ ok: true });
      return false;

    case "getSettings":
      chrome.storage.local.get("proxyUrl", (data) => {
        sendResponse({ proxyUrl: data.proxyUrl || DEFAULT_PROXY_URL });
      });
      return true;

    case "saveSettings":
      chrome.storage.local.set({ proxyUrl: msg.proxyUrl });
      checkHealth();
      sendResponse({ ok: true });
      return false;
  }
});
