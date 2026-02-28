# AI Firewall — Product & Development Documentation

> **Version:** v3.0.0
> **Last Updated:** February 18, 2026
> **Status:** Development Complete — All Phases + Security Hardening Built

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [System Architecture](#2-system-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Feature Matrix](#5-feature-matrix)
6. [Proxy Server](#6-proxy-server)
7. [Scanner Pipeline](#7-scanner-pipeline)
8. [Policy Engine](#8-policy-engine)
9. [AI Gateway Platform](#9-ai-gateway-platform)
10. [VS Code Extension](#10-vs-code-extension)
11. [Browser Extension](#11-browser-extension)
12. [Dashboard](#12-dashboard)
13. [CLI Tool](#13-cli-tool)
14. [CI/CD Integration](#14-cicd-integration)
15. [Air-Gapped Deployment](#15-air-gapped-deployment)
16. [API Reference](#16-api-reference)
17. [Security Architecture](#17-security-architecture)
18. [STRICT_LOCAL Enforcement](#19-strict_local-enforcement)
19. [Prompt-Injection Detection](#20-prompt-injection-detection)
20. [Per-Model Policy Enforcement](#21-per-model-policy-enforcement)
21. [Plugin Scanner](#22-plugin-scanner)
22. [CA Certificate Management](#23-ca-certificate-management)
23. [Environment Configuration](#24-environment-configuration)

---

## 1. Product Overview

### What Is AI Firewall?

AI Firewall is a **local-first AI security gateway** that sits between developer tools (VS Code, browsers, CLI, apps) and AI providers (OpenAI, Anthropic, Google, local LLMs). It intercepts every AI-bound request, scans for secrets, PII, and sensitive business logic, then blocks, redacts, or forwards the cleaned prompt — all before data ever leaves the developer's machine.

### Positioning

> **"Cloudflare for AI Requests — Protect developers from AI data leaks."**

### What Makes It Different

1. **Local-first architecture** — data never leaves the machine without validation
2. **Developer-native** — VS Code extension with inline completions, browser extension, CLI
3. **Smart AI routing** — auto-routes sensitive code to local LLM, safe code to cloud
4. **AI Gateway** — BYOK multi-provider management with credit control
5. **AI Leak Simulator** — shows what AI can infer from your codebase
6. **Pre-flight cost estimation** — see tokens/cost before sending any request
7. **Real-time browser interception** — scans ChatGPT/Claude/Gemini before messages leave

---

## 2. System Architecture

### Full Architecture

```
Developer Machine
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌───────┐  │
│  │ VS Code Ext  │  │ Browser Ext  │  │ CLI Tool │  │ Hooks │  │
│  │              │  │              │  │          │  │       │  │
│  │ • Inline     │  │ • fetch()    │  │ • scan   │  │ • pre │  │
│  │   completions│  │   intercept  │  │ • status │  │  commit│  │
│  │ • Inline chat│  │ • Block/     │  │ • stats  │  │       │  │
│  │ • Chat panel │  │   Redact/    │  │ • export │  │       │  │
│  │ • CodeLens   │  │   Allow      │  │          │  │       │  │
│  │ • Code       │  │ • Banners    │  │          │  │       │  │
│  │   actions    │  │ • Stats      │  │          │  │       │  │
│  └──────┬───────┘  └──────┬───────┘  └────┬─────┘  └───┬───┘  │
│         └─────────────────┼───────────────┼─────────────┘      │
│                           ▼               ▼                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              AI Firewall Proxy (localhost:8080)           │  │
│  │                                                          │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │              Scanner Pipeline                     │    │  │
│  │  │  ┌──────────┐ ┌──────────┐ ┌──────────┐         │    │  │
│  │  │  │ Secret   │ │ PII      │ │ Entropy  │         │    │  │
│  │  │  │ Scanner  │ │ Scanner  │ │ Scanner  │         │    │  │
│  │  │  │ (12 pat) │ │ (7 pat)  │ │(Shannon) │         │    │  │
│  │  │  └────┬─────┘ └────┬─────┘ └────┬─────┘         │    │  │
│  │  │       └─────────────┼────────────┘               │    │  │
│  │  │                     ▼                             │    │  │
│  │  │          Context-Aware Scorer                     │    │  │
│  │  └──────────────────────┬────────────────────────────┘    │  │
│  │                         ▼                                 │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │           Policy Engine (policy.json)             │    │  │
│  │  │  Per-project overrides via .aifirewall.json       │    │  │
│  │  └───────┬──────────────┬───────────────┬────────────┘    │  │
│  │          │              │               │                 │  │
│  │       BLOCK          REDACT          ALLOW               │  │
│  │     (HTTP 403)    (sanitize)      (forward)              │  │
│  │                      │               │                   │  │
│  │                      ▼               ▼                   │  │
│  │  ┌──────────────────────────────────────────────────┐    │  │
│  │  │           AI Gateway (Multi-Provider)             │    │  │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌────────┐ │    │  │
│  │  │  │ OpenAI  │ │Anthropic│ │ Gemini  │ │ Ollama │ │    │  │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └────────┘ │    │  │
│  │  │  API Key Vault (AES-256-GCM) │ Credit Manager    │    │  │
│  │  │  Usage Tracker               │ Model Registry     │    │  │
│  │  └──────────────────────────────────────────────────┘    │  │
│  │                                                          │  │
│  │  Smart Router ──► Local LLM (risk ≥70)                   │  │
│  │                ──► Cloud + Redaction (risk ≥30)           │  │
│  │                ──► Cloud Direct (risk <30)                │  │
│  │                                                          │  │
│  │  Token Vault ──► Reversible tokenization for audit       │  │
│  │  Logger      ──► SQLite (zero raw secrets in storage)    │  │
│  │  RBAC        ──► admin, security_lead, developer, auditor│  │
│  │  Org Manager ──► Multi-org support                       │  │
│  │  Exports     ──► JSON, CSV, compliance reports           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Dashboard (localhost:3000)                   │  │
│  │  Overview │ Request Log │ Risk Score │ Secret Types       │  │
│  │  Timeline │ Policy Config                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
                               │
                               ▼
                    AI Provider APIs / Local LLMs
```

### Request Flow

```
Request received at /v1/chat/completions
    │
    ├── Extract messages[].content
    │
    ├── File Scope Check (blocklist/allowlist)
    │   └── If file blocked → BLOCK
    │
    ├── Secret Scanner (12 regex patterns)
    ├── PII Scanner (7 regex patterns)
    ├── Entropy Scanner (Shannon entropy + keyword context)
    ├── Context-Aware Scorer (path-based severity adjustment)
    │
    ├── Policy Engine evaluates all scan results
    │   ├── BLOCK → HTTP 403 + log
    │   ├── REDACT → replace matches with [REDACTED_TYPE] tokens → continue
    │   └── ALLOW → continue
    │
    ├── Smart Router determines target
    │   ├── risk ≥ 70 → local LLM (Ollama)
    │   ├── risk ≥ 30 → cloud with redaction
    │   └── risk < 30 → cloud direct
    │
    ├── AI Gateway
    │   ├── Lookup provider + model
    │   ├── Decrypt API key from vault
    │   ├── Check credit limits
    │   ├── Format request for provider (OpenAI/Anthropic/Gemini/Ollama)
    │   └── Forward request
    │
    ├── Log to SQLite (sanitized only, SHA-256 hash of original)
    ├── Record usage (tokens, cost)
    │
    └── Return response with _firewall metadata
```

---

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Proxy server | Node.js 20+ / TypeScript / Fastify |
| Scanner | Custom regex engine + entropy analysis |
| Policy engine | JSON config + TypeScript evaluator |
| Database | SQLite via better-sqlite3 |
| Dashboard | React 19 + Vite 6 + Tailwind CSS 3 |
| VS Code extension | TypeScript + VS Code Extension API + esbuild |
| Browser extension | JavaScript + Chrome Extension Manifest V3 |
| Local LLM | Ollama |
| Encryption | Node.js crypto (AES-256-GCM) |
| Validation | Zod |
| CLI | TypeScript compiled to CommonJS |
| Containerization | Docker + Docker Compose |

---

## 4. Project Structure

```
ai-firewall/
├── proxy/                              # Core proxy server
│   ├── src/
│   │   ├── server.ts                   # Fastify entry point
│   │   ├── config.ts                   # Env + policy config loader
│   │   ├── types/index.ts             # All TypeScript types
│   │   ├── routes/
│   │   │   ├── ai.route.ts            # POST /v1/chat/completions
│   │   │   ├── health.route.ts        # GET /health
│   │   │   ├── logs.route.ts          # GET /api/logs
│   │   │   ├── stats.route.ts         # GET /api/stats + /api/risk-score
│   │   │   ├── policy.route.ts        # GET/PUT /api/policy
│   │   │   ├── auth.route.ts          # Register, login, tokens
│   │   │   ├── org.route.ts           # Organization CRUD
│   │   │   ├── export.route.ts        # JSON/CSV/compliance exports
│   │   │   ├── simulator.route.ts     # POST /api/simulate
│   │   │   ├── provider.route.ts      # BYOK provider + model CRUD
│   │   │   ├── credit.route.ts        # Credit limit management
│   │   │   ├── usage.route.ts         # Usage summary + recent
│   │   │   ├── estimate.route.ts      # POST /api/estimate
│   │   │   ├── browserScan.route.ts   # POST /api/browser-scan
│   │   │   ├── permission.route.ts    # POST /api/permission-check
│   │   │   └── vault.route.ts         # Reversible token management
│   │   ├── scanner/
│   │   │   ├── patterns.ts            # All regex patterns centralized
│   │   │   ├── secretScanner.ts       # Regex-based secret detection
│   │   │   ├── piiScanner.ts          # Regex-based PII detection
│   │   │   ├── entropyScanner.ts      # Shannon entropy-based detection
│   │   │   └── contextScanner.ts      # Path-aware severity adjustment
│   │   ├── policy/
│   │   │   ├── policyEngine.ts        # Rule evaluation logic
│   │   │   └── projectPolicy.ts       # Per-project .aifirewall.json
│   │   ├── redactor/
│   │   │   └── redactor.ts            # Token replacement logic
│   │   ├── router/
│   │   │   └── smartRouter.ts         # Risk-based model routing
│   │   ├── gateway/
│   │   │   ├── providerService.ts     # Provider CRUD
│   │   │   ├── modelService.ts        # Model registry
│   │   │   ├── creditService.ts       # Credit enforcement
│   │   │   ├── usageService.ts        # Usage recording
│   │   │   └── gatewayRouter.ts       # Multi-provider request routing
│   │   ├── vault/
│   │   │   ├── encryption.ts          # AES-256-GCM for API keys
│   │   │   └── tokenVault.ts          # Reversible tokenization
│   │   ├── auth/
│   │   │   ├── authService.ts         # User/token management
│   │   │   └── authMiddleware.ts      # Role-based access control
│   │   ├── org/
│   │   │   └── orgService.ts          # Organization management
│   │   ├── export/
│   │   │   └── exportService.ts       # JSON/CSV/compliance exports
│   │   ├── simulator/
│   │   │   └── leakSimulator.ts       # AI leak simulation
│   │   ├── scope/
│   │   │   └── fileScope.ts           # File blocklist/allowlist
│   │   ├── logger/
│   │   │   └── logger.ts              # SQLite write operations
│   │   └── db/
│   │       └── database.ts            # SQLite init + all schemas
│   ├── policy.json
│   ├── .env.example
│   ├── package.json
│   └── tsconfig.json
│
├── dashboard/                          # Web-based monitoring UI
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                    # Layout + routing
│   │   ├── api.ts                     # API client
│   │   ├── pages/
│   │   │   ├── Overview.tsx           # Stats, charts, rates
│   │   │   ├── Logs.tsx               # Sortable/filterable log table
│   │   │   ├── RiskScore.tsx          # Ring chart, breakdown, recommendations
│   │   │   ├── SecretTypes.tsx        # Distribution bars by type
│   │   │   ├── Timeline.tsx           # Chronological view with risk dots
│   │   │   └── Settings.tsx           # Toggle rules, edit paths, thresholds
│   │   └── components/
│   │       ├── StatCard.tsx
│   │       ├── ActionBadge.tsx
│   │       ├── RiskBadge.tsx
│   │       └── BarChart.tsx
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── package.json
│
├── extension/                          # VS Code extension
│   ├── src/
│   │   ├── extension.ts              # Entry point — registers all providers
│   │   ├── commands.ts               # All command registrations
│   │   ├── statusBar.ts              # Color-coded status bar
│   │   ├── inlineCompletion.ts       # Ghost text completion provider
│   │   ├── inlineChat.ts             # Cmd+I inline editing
│   │   ├── codeActions.ts            # Lightbulb menu actions
│   │   ├── codeLens.ts               # Inline secret annotations
│   │   ├── services/
│   │   │   └── proxyClient.ts        # HTTP client for proxy API
│   │   └── views/
│   │       ├── chatViewProvider.ts    # Webview host + message handler
│   │       └── webview/
│   │           └── main.ts           # Full sidebar UI (chat, providers, credits)
│   ├── resources/icon.svg
│   ├── esbuild.js
│   └── package.json
│
├── browser-extension/                  # Chrome extension
│   ├── manifest.json                  # Manifest V3
│   ├── interceptor.js                 # MAIN world — patches fetch/XHR
│   ├── content.js                     # ISOLATED world — banners + relay
│   ├── background.js                  # Service worker — stats + health
│   ├── popup.html                     # Popup UI
│   ├── popup.js                       # Dashboard/activity/settings tabs
│   └── icons/
│
├── cli/                               # Command-line tool
│   ├── src/index.ts                   # scan, status, stats, export commands
│   └── package.json
│
├── hooks/
│   └── pre-commit                     # Git pre-commit hook
│
├── .github/
│   └── workflows/
│       └── ai-firewall-scan.yml       # GitHub Action for PR scanning
│
├── Dockerfile                          # Multi-stage production build
├── docker-compose.yml                  # Proxy + optional Ollama
├── .dockerignore
├── .gitignore
├── LICENSE                             # MIT
└── README.md
```

---

## 5. Feature Matrix

### Phase 1 — MVP (Core Engine)

| # | Feature | Status | Module |
|---|---|---|---|
| F1 | Local Secure AI Proxy | ✅ | `proxy/src/server.ts` |
| F2 | Secret Detection Engine (12 patterns) | ✅ | `scanner/secretScanner.ts` |
| F3 | PII Detection Engine (7 patterns) | ✅ | `scanner/piiScanner.ts` |
| F4 | Policy Engine | ✅ | `policy/policyEngine.ts` |
| F5 | Redaction Engine | ✅ | `redactor/redactor.ts` |
| F6 | SQLite Logger | ✅ | `logger/logger.ts` |
| F7 | VS Code Extension | ✅ | `extension/` |
| F8 | Browser Extension | ✅ | `browser-extension/` |
| F9 | Local Dashboard | ✅ | `dashboard/` |

### Phase 2 — Differentiation

| # | Feature | Status | Module |
|---|---|---|---|
| F10 | Smart AI Router | ✅ | `router/smartRouter.ts` |
| F11 | AI Leak Simulator | ✅ | `simulator/leakSimulator.ts` |
| F12 | Local LLM Integration (Ollama) | ✅ | `gateway/gatewayRouter.ts` |
| F13 | Reversible Tokenization | ✅ | `vault/tokenVault.ts` |
| F14 | Per-Project Policy Profiles | ✅ | `policy/projectPolicy.ts` |
| F15 | Entropy-Based Detection | ✅ | `scanner/entropyScanner.ts` |
| F16 | Context-Aware Scanning | ✅ | `scanner/contextScanner.ts` |

### Phase 3 — Enterprise

| # | Feature | Status | Module |
|---|---|---|---|
| F17 | RBAC (4 roles) | ✅ | `auth/authService.ts` |
| F18 | Organization Management | ✅ | `org/orgService.ts` |
| F19 | Compliance & Audit Exports | ✅ | `export/exportService.ts` |
| F20 | Air-Gapped Deployment | ✅ | `Dockerfile`, `docker-compose.yml` |
| F21 | CI/CD Integration | ✅ | `hooks/`, `.github/workflows/` |
| F22 | AI Permission Prompt | ✅ | `routes/permission.route.ts` |
| F23 | File Scope Control | ✅ | `scope/fileScope.ts` |

### Phase 4 — AI Gateway Platform

| # | Feature | Status | Module |
|---|---|---|---|
| F24 | BYOK Provider Management | ✅ | `gateway/providerService.ts` |
| F25 | API Key Vault (AES-256-GCM) | ✅ | `vault/encryption.ts` |
| F26 | Model Registry | ✅ | `gateway/modelService.ts` |
| F27 | Credit Management + Limits | ✅ | `gateway/creditService.ts` |
| F28 | Usage Tracking | ✅ | `gateway/usageService.ts` |
| F29 | Multi-Provider Router | ✅ | `gateway/gatewayRouter.ts` |
| F30 | Pre-flight Cost Estimation | ✅ | `routes/estimate.route.ts` |

### Phase 5 — Security Hardening

| # | Feature | Status | Module |
|---|---|---|---|
| F31 | STRICT_LOCAL Enforcement | ✅ | `config.ts`, `gatewayRouter.ts`, `smartRouter.ts` |
| F32 | Prompt-Injection Detector (13 patterns) | ✅ | `scanner/promptInjectionScanner.ts` |
| F33 | Per-Model Policy Enforcement | ✅ | `policy/modelPolicy.ts` |
| F34 | Hardened BlindMI (multi-signal) | ✅ | `audit/blindMi.ts` |
| F35 | IDE Plugin Scanner | ✅ | `scanner/pluginScanner.ts`, `routes/pluginScan.route.ts` |
| F36 | CA Install/Uninstall Scripts | ✅ | `tools/ca-manager/` |

### VS Code Extension Features

| Feature | Keybinding | Module |
|---|---|---|
| Inline Completions (ghost text) | Auto / Cmd+Shift+I toggle | `inlineCompletion.ts` |
| Inline Chat (edit with AI) | Cmd+I | `inlineChat.ts` |
| Sidebar Chat | Cmd+Shift+A | `chatViewProvider.ts` |
| Code Actions (lightbulb) | Select code | `codeActions.ts` |
| CodeLens (secret annotations) | Automatic | `codeLens.ts` |
| View Dashboard | Command palette | `commands.ts` |
| View Logs | Command palette | `commands.ts` |
| Toggle Scanning | Command palette | `commands.ts` |
| Show Risk Score | Command palette | `commands.ts` |
| Explain / Refactor / Document / Fix / Generate Tests | Right-click | `commands.ts` |
| Insert / Replace / Copy code blocks | Chat UI buttons | `webview/main.ts` |
| Scan Installed Extensions | Command palette | `commands.ts` |

---

## 6. Proxy Server

**Runtime:** localhost:8080
**Framework:** Fastify + TypeScript
**Database:** SQLite via better-sqlite3

### Database Tables

| Table | Purpose |
|---|---|
| `logs` | Sanitized audit trail of every AI request |
| `organizations` | Multi-org support |
| `users` | Authentication + RBAC |
| `api_tokens` | Bearer token auth |
| `providers` | BYOK AI providers |
| `models` | Model registry per provider |
| `credits` | Credit limits (requests/tokens/dollars) |
| `usage_logs` | Per-request token + cost tracking |
| `token_vault` | Reversible tokenization storage |
| `admin_audit` | Admin action audit trail |
| `audit_queue` | Privacy audit review queue |

---

## 7. Scanner Pipeline

### Secret Patterns (12)

| Type | Pattern | Severity |
|---|---|---|
| AWS_KEY | `AKIA[0-9A-Z]{16}` | Critical |
| PRIVATE_KEY | `-----BEGIN (RSA\|EC\|DSA\|PRIVATE) KEY-----` | Critical |
| DATABASE_URL | `(postgres\|mysql\|mongodb)://...` | Critical |
| GITHUB_TOKEN | `gh[pousr]_[A-Za-z0-9_]{36,}` | Critical |
| AZURE_KEY | `[A-Za-z0-9+/]{86}==` | Critical |
| JWT | `eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+` | High |
| BEARER_TOKEN | `Bearer\s[A-Za-z0-9\-_.]{20,}` | High |
| GENERIC_API_KEY | `(api[_-]?key\|apikey)\s*[:=]\s*...` | High |
| SLACK_TOKEN | `xox[baprs]-[A-Za-z0-9-]+` | High |
| GOOGLE_API_KEY | `AIza[0-9A-Za-z\-_]{35}` | High |
| HARDCODED_PASSWORD | `(password\|passwd\|pwd)\s*[:=]\s*'..."` | High |
| ENV_VARIABLE | `[A-Z_]{3,}=\S{8,}` | Medium |

### PII Patterns (7)

| Type | Pattern | Severity |
|---|---|---|
| EMAIL | Standard email regex | Medium |
| PHONE | `\+?[0-9]{10,13}` | Medium |
| IP_ADDRESS | IPv4 address | Medium |
| AADHAAR | Indian national ID | High |
| PAN | Indian tax ID | High |
| SSN | US Social Security Number | High |
| CREDIT_CARD | 13-16 digit number with Luhn validation | High |

### Entropy Scanner

Detects high-entropy strings (Shannon entropy > 4.0) near context keywords (`key`, `secret`, `token`, `password`, etc.). Catches secrets that don't match any regex pattern.

### Context-Aware Scorer

Adjusts severity based on file paths:
- **Downgrades** matches in test/fixture/mock files
- **Downgrades** known placeholder values (`test123`, `changeme`, etc.)
- **Upgrades** matches in sensitive paths (`auth/`, `payment/`, `config/`)

---

## Privacy Audit & Leak Detection (Phase X)

This product includes an automated privacy-audit pipeline to detect potential training-data leakage or PII exposure from code-generation models. The approach is inspired by the CodexLeaks research and is implemented as an opt-in auditing and pre-flight feature.

Key components:
- Blind Membership Inference (BlindMI): statistical pre-filter using subsequence perplexity and differential comparisons to flag outputs likely memorized from training data.
- GitHub / Repo Cross-check: hit-rate heuristics that query GitHub (or internal repo search) for matches as a ground-truth proxy.
- Human-in-the-loop Dashboard: flagged candidates go to an audit queue for review, masking sensitive elements when shown to human reviewers.
- PrivacyRisk in Pre-flight: `POST /api/estimate` may optionally include `privacyRisk` and recommended actions (redact, route to local LLM, require human approval).

API & integration points:
- `POST /api/estimate` — returns estimated tokens, cost, credit status, standard scan result, and optionally `privacyRisk` when the audit module is enabled.
- `POST /api/audit/queue` — internal route to enqueue model outputs for human review (dashboard).
- `GET /api/audit/queue` — list audit candidates for review (dashboard).
- `POST /api/audit/action` — accept/reject/annotate actions from reviewers.

Operational notes:
- Audit mode is opt-in and configurable per-project. It can be expensive in API calls, so use surrogate/local models for low-cost prefiltering where possible.
- The system masks sensitive substrings in the dashboard UI; raw strings are stored only in the encrypted token vault and accessible only to admins via the reversible token workflow.

Limitations and ethics:
- GitHub search is a heuristic only — removal/takedown of training artifacts and private data may limit verification.
- BlindMI works best when log-prob or probability vectors are available from the provider; fallback heuristics use surrogate perplexity estimators.
- All audit activities should follow ethical guidelines — user consent, limited retention, and secure storage.

## 8. Policy Engine

### Configuration (`policy.json`)

```json
{
  "version": "1.1",
  "rules": {
    "block_private_keys": true,
    "block_aws_keys": true,
    "block_db_urls": true,
    "block_github_tokens": true,
    "redact_emails": true,
    "redact_phone": true,
    "redact_jwt": true,
    "redact_generic_api_keys": true,
    "allow_source_code": true,
    "log_all_requests": true
  },
  "file_scope": {
    "mode": "blocklist",
    "blocklist": [".env", "*.pem", "*.key", "secrets/"],
    "allowlist": ["src/**"],
    "max_file_size_kb": 500
  },
  "blocked_paths": ["/payments/", "/auth/", "/internal/", "/.env"],
  "severity_threshold": "medium",
  "smart_routing": {
    "enabled": false,
    "routes": [
      { "condition": "risk_score >= 70", "target": "local_llm" },
      { "condition": "risk_score >= 30", "target": "cloud_redacted" },
      { "condition": "default", "target": "cloud_direct" }
    ],
    "local_llm": {
      "provider": "ollama",
      "model": "llama3",
      "endpoint": "http://localhost:11434"
    }
  }
}
```

### Per-Project Override (`.aifirewall.json`)

Place in project root to override global policy:

```json
{
  "extends": "global",
  "rules": { "block_db_urls": true, "allow_source_code": false },
  "blocked_paths": ["/src/payments/", "/src/auth/secrets/"]
}
```

---

## 9. AI Gateway Platform

### Supported Providers

| Provider | API Format | Supported |
|---|---|---|
| OpenAI | `/v1/chat/completions` | ✅ |
| Anthropic | `/v1/messages` | ✅ |
| Google Gemini | `generateContent` | ✅ |
| Ollama (Local) | `/api/chat` | ✅ |

### Key Features

- **BYOK (Bring Your Own Key)** — Store API keys encrypted with AES-256-GCM
- **Credit Limits** — Per-provider/model limits by request count, tokens, or dollars
- **Auto-Reset** — Credits reset on configurable schedule (daily/weekly/monthly)
- **Usage Tracking** — Per-request token and cost recording with summary breakdowns
- **Pre-flight Estimation** — `POST /api/estimate` returns scan result + estimated tokens + cost + credit remaining before sending

---

## 10. VS Code Extension

### Inline Completions

Ghost text suggestions as you type, press Tab to accept. Uses 50 lines prefix + 20 lines suffix for fill-in-the-middle context. Configurable debounce delay and separate model selection for speed.

### Inline Chat

`Cmd+I` to open inline chat. With selection: asks how to change the code. Without selection: generates new code at cursor. Shows Apply / Apply & Format / Copy / Discard dialog.

### CodeLens

Inline annotations above lines containing detected secrets:

```
⚠ AI Firewall: AWS Key detected — will be redacted before AI access
const key = "AKIAIOSFODNN7EXAMPLE";
```

### 19 Registered Commands

`Open Chat`, `Add Provider`, `Select Model`, `Show Credit Status`, `Explain Code`, `Refactor Code`, `Document Code`, `Fix Code`, `Generate Tests`, `Inline Chat`, `Inline Edit`, `Toggle Inline Completions`, `Insert Code`, `Replace Selection`, `Copy Code`, `View Dashboard`, `View Logs`, `Toggle Scanning`, `Show Risk Score`

---

## 11. Browser Extension

### How It Works

1. `interceptor.js` runs in `MAIN` world on AI chat pages (ChatGPT, Claude, Gemini)
2. Patches `window.fetch` and `XMLHttpRequest` before the page loads
3. Intercepts every POST to AI API endpoints
4. Extracts message text from request body (supports OpenAI, Anthropic, Gemini, ChatGPT backend formats)
5. Sends to proxy `POST /api/browser-scan` for scanning
6. **BLOCK** → returns fake 403, request never reaches AI provider
7. **REDACT** → rewrites body with sanitized content, then sends
8. **ALLOW** → passes through unchanged
9. `content.js` shows color-coded slide-down banner on the page

### Popup Dashboard

Three tabs: Dashboard (stats grid), Activity (scrollable log), Settings (proxy URL config)

---

## 12. Dashboard

**URL:** `http://localhost:3000`
**Stack:** React 19 + Vite 6 + Tailwind CSS 3 + React Router 7

| View | Content |
|---|---|
| **Overview** | Total/blocked/redacted/allowed counts, block/redact rates, avg risk score, requests by day chart, secrets by type chart |
| **Request Log** | Sortable/filterable table with expandable details, pagination, action filter buttons |
| **Risk Score** | Ring chart (0-100), severity breakdown, secrets by type, recommendations |
| **Secret Types** | Distribution bars by type with percentages, total counts |
| **Timeline** | Chronological view grouped by day, colored action dots, risk badges |
| **Policy Config** | Toggle detection rules, edit severity threshold, manage blocked paths, toggle smart routing |

---

## 13. CLI Tool

```bash
aifirewall scan [dir]           # Scan directory for AI-leakable content
aifirewall status               # Check proxy server health
aifirewall stats                # Show request statistics
aifirewall export [format]      # Export audit logs (json|csv|compliance)
aifirewall help                 # Show help
```

---

## 14. CI/CD Integration

### Pre-Commit Hook

Scans staged files before allowing commit. Blocks if critical secrets detected.

```bash
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### GitHub Action

`.github/workflows/ai-firewall-scan.yml` — scans PRs for AI-leakable content. Annotates files with warnings/errors.

---

## 15. Air-Gapped Deployment

```bash
# Standard deployment
docker compose up -d

# With local LLM (Ollama)
docker compose --profile local-llm up -d
```

Multi-stage Dockerfile: builds proxy + dashboard, runs as minimal Alpine image. Health check included.

---

## 16. API Reference

### Core Proxy

| Method | Endpoint | Description |
|---|---|---|
| POST | `/v1/chat/completions` | OpenAI-compatible proxy with scanning |
| GET | `/health` | Health check |

### Scanner & Policy

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/browser-scan` | Lightweight scan (for browser extension) |
| POST | `/api/estimate` | Pre-flight cost estimation |
| POST | `/api/permission-check` | Interactive permission prompt |
| POST | `/api/simulate` | AI Leak Simulator |
| GET | `/api/logs` | Paginated audit logs |
| GET | `/api/stats` | Aggregated statistics |
| GET | `/api/risk-score` | Project risk score |
| GET/PUT | `/api/policy` | Policy configuration |
| GET/PUT | `/api/file-scope` | File scope configuration |

### Authentication & RBAC

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Current user |
| POST/GET/DELETE | `/api/auth/tokens` | API token management |
| GET | `/api/admin/users` | List users (admin) |
| PUT | `/api/admin/users/:id/role` | Update role (admin) |

### Organizations

| Method | Endpoint | Description |
|---|---|---|
| POST/GET | `/api/orgs` | Create/list organizations |
| GET/DELETE | `/api/orgs/:id` | Get/delete organization |
| POST/DELETE | `/api/orgs/:id/members` | Manage members |

### AI Gateway

| Method | Endpoint | Description |
|---|---|---|
| POST/GET | `/api/providers` | Create/list providers |
| GET/PATCH/DELETE | `/api/providers/:id` | Manage provider |
| POST/GET | `/api/providers/:id/models` | Add/list models |
| GET/PATCH/DELETE | `/api/models/:id` | Manage models |
| POST/GET | `/api/credits` | Create/list credit limits |
| GET | `/api/credits/status/:providerId` | Credit status |
| GET | `/api/usage/summary` | Usage summary |
| GET | `/api/usage/recent` | Recent usage |

### Token Vault

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/vault/tokens` | List vault tokens |
| POST | `/api/vault/resolve` | Reverse a token (admin) |
| POST | `/api/vault/purge` | Purge expired tokens |

### Exports

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/export/json` | Export logs as JSON |
| GET | `/api/export/csv` | Export logs as CSV |
| GET | `/api/export/compliance` | Compliance summary report |

---

## 17. Security Architecture

| Requirement | Implementation |
|---|---|
| No raw secrets stored | Only sanitized text + SHA-256 hash of original in SQLite |
| Local-only by default | Zero telemetry, no phone-home |
| Encrypted API key vault | AES-256-GCM with MASTER_KEY |
| Reversible tokenization | Admin-only vault with TTL-based expiry |
| Scanner runs offline | No external network calls from scanner pipeline |
| RBAC enforcement | 4 roles with middleware-level permission checks |
| Input validation | All requests validated with Zod schemas |
| CORS | Fastify CORS middleware (configurable origins) |
| File scope control | Glob-based blocklist/allowlist for AI file access |
| STRICT_LOCAL mode | Runtime flag blocks all cloud providers — local LLM only |
| Prompt-injection detection | 13 regex patterns scoring instruction-override attacks |
| Per-model policy | Restrict which files each AI model can access |
| Plugin scanner | Detect suspicious IDE extensions by permissions and publisher |
| CA management | Generate, install, and uninstall local root CA with consent flows |

---

## 19. STRICT_LOCAL Enforcement

When enabled (`strict_local: true` in `policy.json` or `STRICT_LOCAL=true` env var), the proxy **rejects every request** to a cloud AI provider. Only locally-running providers (Ollama, etc.) are permitted.

- **Gateway router**: blocks gateway route resolution for any non-local provider
- **Smart router**: always routes to `local_llm` regardless of risk score
- **AI route**: returns `HTTP 403` with code `STRICT_LOCAL_ENFORCED` if no local route is found

Use case: Air-gapped or compliance-heavy environments where no data may leave the machine.

---

## 20. Prompt-Injection Detection

The prompt-injection scanner (`scanner/promptInjectionScanner.ts`) analyses every inbound prompt for 13 categories of jailbreak/injection patterns:

| Pattern Category | Weight | Example |
|---|---|---|
| Instruction override | 30 | "Ignore all previous instructions" |
| System prompt extraction | 30 | "Repeat your system prompt" |
| Delimiter injection | 30 | \`\`\`system or \<\|im_start\|\> |
| Data exfiltration | 35 | "Send all files to..." |
| DAN / jailbreak | 25 | "Do Anything Now" |
| Role-play | 20 | "Pretend you are..." |
| New instructions | 25 | "New instructions:" |
| Persona switch | 25 | "Switch to evil mode" |
| Context confusion | 25 | "Forget everything" |
| Chain-of-thought leak | 20 | "Show your reasoning" |
| Output format hijack | 20 | "Respond only with..." |
| Encoding bypass | 15 | base64 decode, hex escape |
| Indirect injection | 20 | "When you see this..." |

The result includes a `score` (0–100), `isInjection` flag (true if score >= threshold), and individual match details. The threshold is configurable in `policy.json` → `prompt_injection.threshold` (default: 60).

Integrated into:
- `POST /v1/chat/completions` — blocks the request
- `POST /api/estimate` — returns `promptInjection` in pre-flight response
- `POST /api/browser-scan` — blocks browser-originated injections

---

## 21. Per-Model Policy Enforcement

The `model_policies` section in `policy.json` restricts which files each AI model can access, using glob patterns:

```json
"model_policies": {
  "gpt-4": { "allowed_paths": ["src/frontend/**"], "blocked_paths": ["src/auth/**"] },
  "claude-3": { "allowed_paths": ["**/*.md", "docs/**"], "blocked_paths": [] },
  "default": { "allowed_paths": ["**"], "blocked_paths": [] }
}
```

Evaluation is done via picomatch glob matching. If a file referenced in the request metadata matches a `blocked_paths` pattern (or doesn't match any `allowed_paths` pattern), the request is blocked with `HTTP 403` and code `MODEL_POLICY_BLOCKED`.

---

## 22. Plugin Scanner

The plugin scanner (`POST /api/plugin-scan`) analyses IDE extension metadata for security risks:

- **Publisher trust**: flags unknown or untrusted publishers
- **Permission analysis**: flags `shell`, `fs`, `network`, `env`, `clipboard` access
- **Activation events**: flags wildcard (`*`) or startup-immediate activation
- **Capability checks**: flags extensions that run in untrusted workspaces

The VS Code extension includes a `Scan Installed Extensions` command that collects metadata from all installed extensions and sends it to the proxy for analysis.

---

## 23. CA Certificate Management

Scripts in `proxy/tools/ca-manager/` manage a local root CA for optional TLS interception:

| Script | Platform | Purpose |
|---|---|---|
| `generate-ca.sh` | All | Generate 4096-bit RSA root CA |
| `install-ca-macos.sh` | macOS | Add to System Keychain |
| `install-ca-linux.sh` | Linux | Copy to `/usr/local/share/ca-certificates` |
| `uninstall-ca-macos.sh` | macOS | Remove from Keychain |
| `uninstall-ca-linux.sh` | Linux | Remove from trust store |

All scripts display a consent banner and require explicit `yes` confirmation before any action. sudo is required for install/uninstall operations.

---

## 24. Environment Configuration

### `.env`

```env
PORT=8080
PROVIDER_URL=https://api.openai.com/v1/chat/completions
OPENAI_API_KEY=your_key_here
DB_PATH=./data/firewall.db
MASTER_KEY=your_encryption_master_key
STRICT_LOCAL=false
```

### Startup Commands

```bash
# Proxy server
cd proxy && npm install && npm run build && npm start

# Dashboard
cd dashboard && npm install && npm run dev

# VS Code extension
cd extension && npm install && npm run build
# Then F5 in VS Code

# Browser extension
# Chrome → chrome://extensions → Load unpacked → browser-extension/

# CLI
cd cli && npm install && npm run build
node dist/index.js scan ./src
```

---

*End of Document — AI Firewall v2.0.0*
