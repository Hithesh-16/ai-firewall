(function () {
  "use strict";

  const PROXY_SCAN_URL = "http://localhost:8080/api/browser-scan";

  const AI_API_PATTERNS = [
    { host: "api.openai.com", pathPrefix: "/v1/", source: "openai-api" },
    { host: "api.anthropic.com", pathPrefix: "/v1/", source: "anthropic-api" },
    {
      host: "generativelanguage.googleapis.com",
      pathPrefix: "/",
      source: "gemini-api"
    }
  ];

  const CHAT_BACKEND_PATTERNS = [
    {
      host: "chatgpt.com",
      pathPrefix: "/backend-api/conversation",
      source: "chatgpt-web"
    },
    {
      host: "chat.openai.com",
      pathPrefix: "/backend-api/conversation",
      source: "chatgpt-web"
    },
    { host: "claude.ai", pathPrefix: "/api/", source: "claude-web" },
    {
      host: "gemini.google.com",
      pathPrefix: "/_/BardChatUi/",
      source: "gemini-web"
    }
  ];

  const ALL_PATTERNS = [...AI_API_PATTERNS, ...CHAT_BACKEND_PATTERNS];

  const originalFetch = window.fetch;

  function matchesPattern(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      return ALL_PATTERNS.find(
        (p) =>
          parsed.hostname === p.host &&
          parsed.pathname.startsWith(p.pathPrefix)
      );
    } catch {
      return undefined;
    }
  }

  function extractTextFromBody(body) {
    if (!body) return null;

    if (typeof body === "string") {
      try {
        return extractFromParsed(JSON.parse(body));
      } catch {
        return body;
      }
    }

    return null;
  }

  function extractFromParsed(obj) {
    if (!obj || typeof obj !== "object") return null;

    if (Array.isArray(obj.messages)) {
      return obj.messages
        .map((m) => {
          if (typeof m.content === "string") return m.content;
          if (Array.isArray(m.content)) {
            return m.content
              .filter((p) => p.type === "text")
              .map((p) => p.text)
              .join("\n");
          }
          return "";
        })
        .join("\n");
    }

    if (typeof obj.prompt === "string") return obj.prompt;
    if (typeof obj.content === "string") return obj.content;

    if (Array.isArray(obj.contents)) {
      return obj.contents
        .map((c) =>
          Array.isArray(c.parts)
            ? c.parts
                .filter((p) => p.text)
                .map((p) => p.text)
                .join("\n")
            : ""
        )
        .join("\n");
    }

    return JSON.stringify(obj);
  }

  function rebuildBodyWithRedaction(originalBody, redactedText) {
    if (!originalBody || typeof originalBody !== "string") return originalBody;

    try {
      const parsed = JSON.parse(originalBody);
      if (Array.isArray(parsed.messages)) {
        const originalTexts = [];
        for (const m of parsed.messages) {
          if (typeof m.content === "string") {
            originalTexts.push(m.content);
          }
        }

        let remaining = redactedText;
        for (const m of parsed.messages) {
          if (typeof m.content === "string") {
            const originalLen = m.content.length;
            const approxEnd = remaining.indexOf("\n", originalLen - 10);
            if (approxEnd > 0 && approxEnd < originalLen + 50) {
              m.content = remaining.slice(0, approxEnd);
              remaining = remaining.slice(approxEnd + 1);
            } else {
              m.content = remaining;
              remaining = "";
            }
          }
        }
        return JSON.stringify(parsed);
      }

      if (typeof parsed.prompt === "string") {
        parsed.prompt = redactedText;
        return JSON.stringify(parsed);
      }

      return originalBody;
    } catch {
      return originalBody;
    }
  }

  function notifyContentScript(detail) {
    window.postMessage(
      { type: "__AI_FIREWALL_SCAN_RESULT__", detail },
      window.location.origin
    );
  }

  async function scanWithProxy(text, source, url) {
    try {
      const res = await originalFetch(PROXY_SCAN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source, url }),
        signal: AbortSignal.timeout(5000)
      });

      if (!res.ok) return { action: "ALLOW", error: "proxy-error" };
      return await res.json();
    } catch {
      return { action: "ALLOW", error: "proxy-unreachable" };
    }
  }

  window.fetch = async function (input, init) {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input);

    const method = init?.method || (input instanceof Request ? input.method : "GET");

    if (method.toUpperCase() !== "POST") {
      return originalFetch.call(this, input, init);
    }

    const pattern = matchesPattern(url);
    if (!pattern) {
      return originalFetch.call(this, input, init);
    }

    let bodyStr = null;
    if (init?.body) {
      if (typeof init.body === "string") {
        bodyStr = init.body;
      } else if (init.body instanceof ArrayBuffer) {
        bodyStr = new TextDecoder().decode(init.body);
      } else if (init.body instanceof Uint8Array) {
        bodyStr = new TextDecoder().decode(init.body);
      }
    } else if (input instanceof Request) {
      try {
        const cloned = input.clone();
        bodyStr = await cloned.text();
      } catch {
        /* can't read body */
      }
    }

    const text = extractTextFromBody(bodyStr);

    if (!text || text.trim().length === 0) {
      return originalFetch.call(this, input, init);
    }

    const scanResult = await scanWithProxy(text, pattern.source, url);

    if (scanResult.error === "proxy-unreachable") {
      notifyContentScript({
        action: "PROXY_OFFLINE",
        source: pattern.source,
        url
      });
      return originalFetch.call(this, input, init);
    }

    if (scanResult.action === "BLOCK") {
      notifyContentScript({
        action: "BLOCK",
        source: pattern.source,
        url,
        reasons: scanResult.reasons || [],
        secretsFound: scanResult.secretsFound || 0,
        piiFound: scanResult.piiFound || 0,
        riskScore: scanResult.riskScore || 0
      });

      return new Response(
        JSON.stringify({
          error: {
            message:
              "AI Firewall blocked this request — sensitive data detected. " +
              (scanResult.reasons || []).join(", "),
            type: "ai_firewall_block"
          }
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (scanResult.action === "REDACT" && scanResult.redactedText && bodyStr) {
      notifyContentScript({
        action: "REDACT",
        source: pattern.source,
        url,
        reasons: scanResult.reasons || [],
        secretsFound: scanResult.secretsFound || 0,
        piiFound: scanResult.piiFound || 0,
        riskScore: scanResult.riskScore || 0
      });

      const newBody = rebuildBodyWithRedaction(bodyStr, scanResult.redactedText);
      const newInit = { ...(init || {}), body: newBody };
      return originalFetch.call(this, input instanceof Request ? url : input, newInit);
    }

    notifyContentScript({
      action: "ALLOW",
      source: pattern.source,
      url,
      secretsFound: scanResult.secretsFound || 0,
      piiFound: scanResult.piiFound || 0,
      riskScore: scanResult.riskScore || 0
    });

    return originalFetch.call(this, input, init);
  };

  const origXhrOpen = XMLHttpRequest.prototype.open;
  const origXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__afwMethod = method;
    this.__afwUrl = typeof url === "string" ? url : url.toString();
    return origXhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (
      this.__afwMethod &&
      this.__afwMethod.toUpperCase() === "POST" &&
      matchesPattern(this.__afwUrl)
    ) {
      const text = extractTextFromBody(body);
      if (text && text.trim().length > 0) {
        const pattern = matchesPattern(this.__afwUrl);
        const xhr = this;

        scanWithProxy(text, pattern?.source || "xhr", this.__afwUrl).then(
          (scanResult) => {
            if (scanResult.action === "BLOCK") {
              notifyContentScript({
                action: "BLOCK",
                source: pattern?.source || "xhr",
                url: xhr.__afwUrl,
                reasons: scanResult.reasons || [],
                secretsFound: scanResult.secretsFound || 0,
                piiFound: scanResult.piiFound || 0
              });

              xhr.dispatchEvent(new Event("error"));
              return;
            }

            if (
              scanResult.action === "REDACT" &&
              scanResult.redactedText &&
              typeof body === "string"
            ) {
              notifyContentScript({
                action: "REDACT",
                source: pattern?.source || "xhr",
                url: xhr.__afwUrl,
                reasons: scanResult.reasons || [],
                secretsFound: scanResult.secretsFound || 0,
                piiFound: scanResult.piiFound || 0
              });

              const newBody = rebuildBodyWithRedaction(
                body,
                scanResult.redactedText
              );
              origXhrSend.call(xhr, newBody);
              return;
            }

            notifyContentScript({
              action: "ALLOW",
              source: pattern?.source || "xhr",
              url: xhr.__afwUrl,
              secretsFound: scanResult.secretsFound || 0,
              piiFound: scanResult.piiFound || 0
            });

            origXhrSend.call(xhr, body);
          }
        );
        return;
      }
    }

    return origXhrSend.call(this, body);
  };

  console.log(
    "[AI Firewall] Interceptor active — monitoring AI requests on this page"
  );
})();
