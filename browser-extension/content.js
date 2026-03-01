(function () {
  "use strict";

  const BANNER_TIMEOUT = 6000;
  let currentBanner = null;

  function injectStyles() {
    if (document.getElementById("afw-styles")) return;

    const style = document.createElement("style");
    style.id = "afw-styles";
    style.textContent = `
      @keyframes afw-slide-in {
        from { transform: translateY(-100%); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      @keyframes afw-slide-out {
        from { transform: translateY(0); opacity: 1; }
        to { transform: translateY(-100%); opacity: 0; }
      }
      #afw-banner {
        position: fixed;
        top: 0; left: 0; right: 0;
        z-index: 2147483647;
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 16px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 13px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.25);
        animation: afw-slide-in 0.3s ease-out;
        transition: background 0.2s;
      }
      #afw-banner.afw-block {
        background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
        color: #fef2f2;
      }
      #afw-banner.afw-redact {
        background: linear-gradient(135deg, #d97706 0%, #92400e 100%);
        color: #fffbeb;
      }
      #afw-banner.afw-allow {
        background: linear-gradient(135deg, #16a34a 0%, #166534 100%);
        color: #f0fdf4;
      }
      #afw-banner.afw-offline {
        background: linear-gradient(135deg, #6b7280 0%, #374151 100%);
        color: #f3f4f6;
      }
      #afw-banner .afw-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
      }
      #afw-banner .afw-body {
        flex: 1;
        min-width: 0;
      }
      #afw-banner .afw-title {
        font-weight: 600;
        font-size: 13px;
      }
      #afw-banner .afw-detail {
        font-size: 11px;
        opacity: 0.85;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #afw-banner .afw-stats {
        display: flex;
        gap: 12px;
        font-size: 11px;
        flex-shrink: 0;
      }
      #afw-banner .afw-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1px;
      }
      #afw-banner .afw-stat-val {
        font-weight: 700;
        font-size: 14px;
      }
      #afw-banner .afw-stat-label {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        opacity: 0.7;
      }
      #afw-banner .afw-close {
        background: none;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 4px;
        font-size: 18px;
        line-height: 1;
        opacity: 0.7;
        flex-shrink: 0;
      }
      #afw-banner .afw-close:hover { opacity: 1; }
      #afw-banner.afw-hiding {
        animation: afw-slide-out 0.25s ease-in forwards;
      }
    `;
    document.head.appendChild(style);
  }

  function shieldIcon() {
    return `<svg class="afw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
  }

  function blockIcon() {
    return `<svg class="afw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`;
  }

  function warnIcon() {
    return `<svg class="afw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  }

  function checkIcon() {
    return `<svg class="afw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>`;
  }

  function dismissBanner() {
    if (!currentBanner) return;
    currentBanner.classList.add("afw-hiding");
    const ref = currentBanner;
    setTimeout(() => ref.remove(), 260);
    currentBanner = null;
  }

  function showBanner(detail) {
    injectStyles();
    if (currentBanner) currentBanner.remove();

    const banner = document.createElement("div");
    banner.id = "afw-banner";

    let icon, css, title, detailText;
    const secrets = detail.secretsFound || 0;
    const pii = detail.piiFound || 0;
    const reasons = (detail.reasons || []).join(", ");

    switch (detail.action) {
      case "BLOCK":
        css = "afw-block";
        icon = blockIcon();
        title = "Request Blocked by AI Firewall";
        detailText = reasons || "Sensitive data detected";
        break;
      case "REDACT":
        css = "afw-redact";
        icon = warnIcon();
        title = "Sensitive Data Redacted";
        detailText = reasons || "Content was sanitized before sending";
        break;
      case "ALLOW":
        css = "afw-allow";
        icon = checkIcon();
        title = "Request Scanned — Clean";
        detailText = `Sent to ${detail.source || "AI provider"}`;
        break;
      case "PROXY_OFFLINE":
        css = "afw-offline";
        icon = shieldIcon();
        title = "AI Firewall Proxy Offline";
        detailText = "Request sent unscanned — start the proxy server";
        break;
      default:
        return;
    }

    banner.className = css;

    let statsHtml = "";
    if (detail.action !== "PROXY_OFFLINE" && detail.action !== "ALLOW") {
      statsHtml = `
        <div class="afw-stats">
          ${secrets > 0 ? `<div class="afw-stat"><span class="afw-stat-val">${secrets}</span><span class="afw-stat-label">Secrets</span></div>` : ""}
          ${pii > 0 ? `<div class="afw-stat"><span class="afw-stat-val">${pii}</span><span class="afw-stat-label">PII</span></div>` : ""}
          ${detail.riskScore ? `<div class="afw-stat"><span class="afw-stat-val">${detail.riskScore}</span><span class="afw-stat-label">Risk</span></div>` : ""}
        </div>
      `;
    }

    banner.innerHTML = `
      ${icon}
      <div class="afw-body">
        <div class="afw-title">${title}</div>
        <div class="afw-detail">${detailText}</div>
      </div>
      ${statsHtml}
      <button class="afw-close" id="afw-close">&times;</button>
    `;

    document.body.appendChild(banner);
    currentBanner = banner;

    document.getElementById("afw-close").addEventListener("click", dismissBanner);

    setTimeout(dismissBanner, BANNER_TIMEOUT);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "__AI_FIREWALL_SCAN_RESULT__") return;

    const detail = event.data.detail;
    if (!detail || !detail.action) return;

    showBanner(detail);

    try {
      chrome.runtime.sendMessage({
        type: "scanResult",
        detail
      });
    } catch {
      /* extension context may not be available */
    }
  });
})();
