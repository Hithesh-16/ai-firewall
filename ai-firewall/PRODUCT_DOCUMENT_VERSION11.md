# AI Firewall — Product & Development Documentation

> **Version:** v1.0.0-draft
> **Last Updated:** February 18, 2026
> **Status:** Pre-Development

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Vision & Mission](#2-vision--mission)
3. [Competitive Landscape](#3-competitive-landscape)
4. [Product Scope](#4-product-scope)
5. [Feature Specification](#5-feature-specification)
   - [Phase 1 — MVP](#phase-1--mvp-days-130)
   - [Phase 2 — Differentiation](#phase-2--differentiation-days-3190)
   - [Phase 3 — Enterprise](#phase-3--enterprise-days-91180)
6. [System Architecture](#6-system-architecture)
7. [Technology Stack](#7-technology-stack)
8. [Project Structure](#8-project-structure)
9. [Development Plan & Timeline](#9-development-plan--timeline)
10. [Environment & Configuration](#10-environment--configuration)
11. [API Specification](#11-api-specification)
12. [Performance & Security Requirements](#12-performance--security-requirements)
13. [Testing Strategy](#13-testing-strategy)
14. [Monetization Strategy](#14-monetization-strategy)
15. [Risks & Mitigations](#15-risks--mitigations)
16. [Success Metrics](#16-success-metrics)
17. [Additional Recommendations](#17-additional-recommendations)

---

## 1. Product Overview

### 1.1 What Is AI Firewall?

AI Firewall is a **local-first AI security gateway** that sits between developer tools (VS Code, browsers, CLI, apps) and AI providers (OpenAI, Anthropic, Google, local LLMs). It intercepts every AI-bound request, scans for secrets, PII, and sensitive business logic, then blocks, redacts, or forwards the cleaned prompt — all before data ever leaves the developer's machine.

### 1.2 Positioning

> **"Cloudflare for AI Requests — Protect developers from AI data leaks."**

This is not an AI coding assistant. This is an **AI security layer** — a fundamentally different product category targeting the gap between developer productivity tools and enterprise security requirements.

### 1.3 Problem Statement

Every day, millions of developers send code, credentials, and proprietary logic to cloud AI models without visibility or control. Existing AI coding tools (Copilot, Cursor, Codeium) optimize for speed, not security. There is no universal, local-first firewall layer that:

- Shows developers exactly what data is being sent to AI
- Blocks secrets, keys, tokens, and PII automatically
- Routes sensitive prompts to local models and safe prompts to cloud models
- Gives enterprises auditable, policy-driven control over AI usage

### 1.4 Solution

A lightweight, local proxy + extension ecosystem that provides:

- **Real-time interception** and scanning of all AI requests
- **Automatic detection**, redaction, and blocking of secrets and PII
- **Full request visibility** and local audit logging
- **Smart routing** between local and cloud AI models based on sensitivity
- **Enterprise policy engine** with per-project, per-team, and per-org rules

### 1.5 Target Users

| Priority | Segment | Why They Need It | Willingness to Pay |
|---|---|---|---|
| 1 | Enterprises (banks, govt, healthcare) | Regulatory compliance, IP protection | Very High |
| 2 | Mid-size tech companies | Protect proprietary code and infra | High |
| 3 | Security-conscious startups | Prevent credential leaks at scale | Medium–High |
| 4 | Development agencies | Client code confidentiality | Medium |
| 5 | Freelancers / individual devs | Personal key protection | Low–Medium |

---

## 2. Vision & Mission

**Vision:** Every AI interaction is secure by default — no secrets leak, no data is sent without consent, and every developer has full visibility into what AI sees.

**Mission:** Build the industry-standard AI security layer that developers and enterprises trust to protect their code, credentials, and intellectual property from uncontrolled AI exposure.

---

## 3. Competitive Landscape

### 3.1 Direct Competitors — AI Coding Tools

| Competitor | What They Do | Their Weakness |
|---|---|---|
| GitHub Copilot Enterprise | AI coding with org controls | No local-first proxy; limited transparency into what's sent |
| Cursor Enterprise | AI-native IDE with team features | Cloud-dependent; no standalone security layer |
| Codeium | AI code completion | Minimal secret protection; no firewall concept |
| Sourcegraph Cody | AI code search + generation | No dedicated DLP / security gateway |

### 3.2 AI Security Platforms

| Competitor | What They Do | Their Weakness |
|---|---|---|
| Microsoft Purview | Enterprise data governance | Heavy, expensive, not developer-focused |
| Palo Alto Networks AI Security | Network-level AI controls | Enterprise-only, no IDE integration |
| Zscaler | Cloud security gateway | No developer tooling; network-level only |

### 3.3 Major Gaps We Exploit

| Gap | Detail |
|---|---|
| No full transparency | Users don't know what data Copilot/Cursor sends; can't fully control it |
| No local control layer | Most tools send data directly to cloud with no local filtering or routing |
| No fine-grained secret protection | They may catch passwords (basic) but not business logic, proprietary algorithms, internal APIs |
| No AI firewall concept | There is no AI request firewall or AI data leak prevention system purpose-built for developers |

### 3.4 Our Key Differentiators

1. **Local-first architecture** — data never leaves the machine without validation
2. **Developer-native** — VS Code extension, CLI, browser extension (not a network appliance)
3. **Smart AI routing** — auto-routes sensitive code to local LLM, safe code to cloud
4. **AI Leak Simulator** — shows what AI can infer from your codebase (no competitor does this)
5. **Lightweight + fast** — <50ms overhead, <200MB memory
6. **Offline-capable** — works in air-gapped, regulated environments

---

## 4. Product Scope

### 4.1 In Scope vs Out of Scope

| In Scope | Out of Scope (for now) |
|---|---|
| Local AI proxy server | Multi-tenant SaaS platform |
| Secret detection engine | Advanced ML-based code analysis |
| PII detection engine | Kubernetes orchestration |
| Policy engine (JSON config) | Enterprise SSO / SAML |
| Redaction engine | Mobile app |
| VS Code extension | IDE plugins beyond VS Code (Phase 2+) |
| Browser extension | Network-level packet inspection |
| Local dashboard (web UI) | Custom LLM training |
| SQLite logging | |
| Smart AI router (Phase 2) | |
| AI Leak Simulator (Phase 2) | |

### 4.2 Security Levels

| Level | Features | Target User |
|---|---|---|
| **Level 1 — Basic** | Secret scanning, proxy forwarding | Individual developers |
| **Level 2 — Intermediate** | Redaction, policy engine, logging, dashboard | Teams / startups |
| **Level 3 — Advanced** | Local LLM routing, zero-leak architecture, leak simulator | Security-conscious orgs |
| **Level 4 — Enterprise** | RBAC, audit logs, compliance reports, encryption, air-gapped mode | Enterprises / regulated industries |

---

## 5. Feature Specification

### Phase 1 — MVP (Days 1–30)

---

#### F1: Local Secure AI Proxy (Core Engine)

**Purpose:** Central interception point for all AI-bound traffic.

| Attribute | Detail |
|---|---|
| Runtime | `localhost:8080` |
| Protocol | HTTP, OpenAI-compatible `/v1/chat/completions` |
| Framework | Fastify (Node.js / TypeScript) |
| Latency target | <50ms added overhead |
| Memory target | <200MB |

**Request lifecycle:**

```
Receive request
  → Extract prompt text from messages array
  → Run secret scanner
  → Run PII scanner
  → Evaluate policy engine
  → Execute action (ALLOW / REDACT / BLOCK)
  → Log to SQLite
  → Forward cleaned prompt to AI provider (or return HTTP 403)
  → Return AI response to client
```

**Blocked request response:**

```json
{
  "error": "Request blocked due to sensitive data",
  "reasons": ["Private key detected"],
  "code": "FIREWALL_BLOCKED"
}
```

---

#### F2: Secret Detection Engine

**Purpose:** Identify credentials, keys, and tokens in prompt text using pattern matching.

**Detection targets:**

| Secret Type | Regex Pattern | Default Action | Severity |
|---|---|---|---|
| AWS Access Key | `AKIA[0-9A-Z]{16}` | Block | Critical |
| Private Key | `-----BEGIN (RSA\|EC\|DSA\|PRIVATE) KEY-----` | Block | Critical |
| JWT Token | `eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+` | Redact | High |
| Bearer Token | `Bearer\s[A-Za-z0-9\-_\.]{20,}` | Redact | High |
| Generic API Key | `(api[_-]?key\|apikey)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{20,}` | Redact | High |
| Database URL | `(postgres\|mysql\|mongodb)://[^\s]+` | Block | Critical |
| .env content | `[A-Z_]{3,}=\S{8,}` (heuristic) | Redact | Medium |
| GitHub Token | `gh[pousr]_[A-Za-z0-9_]{36,}` | Block | Critical |
| Slack Token | `xox[baprs]-[A-Za-z0-9-]+` | Block | High |
| Google API Key | `AIza[0-9A-Za-z\-_]{35}` | Redact | High |
| Azure Key | `[a-zA-Z0-9+/]{86}==` | Block | Critical |
| Hardcoded Password | `(password\|passwd\|pwd)\s*[:=]\s*['"][^'"]{6,}['"]` | Redact | High |

**Interface:**

```typescript
type SecretMatch = {
  type: string;                              // e.g. "AWS_KEY", "JWT", "PRIVATE_KEY"
  value: string;                             // matched text
  position: number;                          // char offset in prompt
  length: number;                            // match length
  severity: "critical" | "high" | "medium";
};

type ScanResult = {
  hasSecrets: boolean;
  secrets: SecretMatch[];
};

function scanSecrets(text: string): ScanResult;
```

---

#### F3: PII Detection Engine

**Purpose:** Identify personally identifiable information in prompt text.

**Detection targets (MVP — regex-based):**

| PII Type | Pattern |
|---|---|
| Email | `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` |
| Phone | `\+?[0-9]{10,13}` |
| Aadhaar (India) | `[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}` |
| PAN (India) | `[A-Z]{5}[0-9]{4}[A-Z]{1}` |
| SSN (US) | `\d{3}-\d{2}-\d{4}` |
| Credit Card | `\b(?:\d[ -]*?){13,16}\b` (with Luhn validation post-match) |
| IP Address | `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` |

**Interface:**

```typescript
function scanPII(text: string): ScanResult;
```

---

#### F4: Policy Engine

**Purpose:** Decide the action (ALLOW / BLOCK / REDACT) based on scan results and user-defined rules.

**Configuration file:** `policy.json`

```json
{
  "version": "1.0",
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
  "blocked_paths": [
    "/payments/",
    "/auth/",
    "/internal/",
    "/.env"
  ],
  "severity_threshold": "medium"
}
```

**Interface:**

```typescript
type PolicyDecision = {
  action: "ALLOW" | "BLOCK" | "REDACT";
  reasons: string[];
  riskScore: number; // 0–100
};

function evaluate(
  secretResult: ScanResult,
  piiResult: ScanResult,
  policy: PolicyConfig
): PolicyDecision;
```

**Evaluation logic:**

```
IF any secret with severity "critical" detected  → BLOCK
IF private key detected                          → BLOCK
IF email or phone detected and redact enabled    → REDACT
IF risk_score > severity_threshold               → REDACT
ELSE                                             → ALLOW
```

---

#### F5: Redaction Engine

**Purpose:** Replace sensitive content with safe, typed placeholder tokens.

| Input | Output |
|---|---|
| `My key is AKIAIOSFODNN7EXAMPLE` | `My key is [REDACTED_AWS_KEY]` |
| `Email me at john@corp.com` | `Email me at [REDACTED_EMAIL]` |
| `Bearer eyJhbGciOi...` | `Bearer [REDACTED_JWT]` |
| `password = "s3cretPass!"` | `password = "[REDACTED_PASSWORD]"` |

**Interface:**

```typescript
function redact(text: string, matches: SecretMatch[]): string;
```

Tokens are stable and typed (`[REDACTED_AWS_KEY_1]`, `[REDACTED_EMAIL_2]`) so analytics can count by category without exposing actual values.

---

#### F6: SQLite Logger

**Purpose:** Local audit trail of every AI interaction.

**Schema:**

```sql
CREATE TABLE logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       INTEGER NOT NULL,
  model           TEXT NOT NULL,
  provider        TEXT NOT NULL,
  original_hash   TEXT NOT NULL,        -- SHA-256 of original prompt; raw text is NEVER stored
  sanitized_text  TEXT NOT NULL,
  secrets_found   INTEGER DEFAULT 0,
  pii_found       INTEGER DEFAULT 0,
  risk_score      INTEGER DEFAULT 0,
  action          TEXT NOT NULL,        -- ALLOW | BLOCK | REDACT
  reasons         TEXT,                 -- JSON array of strings
  response_time_ms INTEGER
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_action ON logs(action);
```

**Critical security rule:** Never store raw secrets. Store only the sanitized version and a SHA-256 hash of the original prompt for deduplication and forensics.

---

#### F7: VS Code Extension

**Purpose:** Redirect AI tool traffic through the local proxy and surface warnings in-editor.

**Capabilities:**

- Override `openai.apiBase` and equivalent config settings to point to `localhost:8080`
- Show notification when a request is blocked: *"AI Firewall: Secret detected. Request blocked."*
- Show inline indicator when a request was redacted
- Status bar icon with color state:
  - Green: clean request sent
  - Yellow: request was redacted
  - Red: request was blocked
- Command palette commands:
  - `AI Firewall: View Dashboard`
  - `AI Firewall: View Logs`
  - `AI Firewall: Toggle Scanning`
  - `AI Firewall: Show Risk Score`

---

#### F8: Browser Extension

**Purpose:** Intercept AI requests from web-based tools (ChatGPT, Claude, Gemini web interfaces).

**Intercept targets:**

- `api.openai.com`
- `api.anthropic.com`
- `generativelanguage.googleapis.com`

**Capabilities:**

- Redirect matching requests through local proxy
- Badge icon showing scan status (clean / redacted / blocked)
- Popup with summary of last N requests and their actions
- Content script banner injected into AI chat pages: *"AI Firewall active — 2 secrets redacted"*

---

#### F9: Local Dashboard (Web UI)

**Purpose:** Visual overview of AI request history, risk posture, and policy configuration.

**URL:** `http://localhost:3000`

**Views:**

| View | Content |
|---|---|
| **Overview** | Total requests today/week/month, blocked %, redacted %, risk trend chart |
| **Request Log** | Sortable/filterable table: timestamp, model, action, risk score, expandable details |
| **Risk Score** | Project safety score (0–100), breakdown by secret type and severity |
| **Policy Config** | Edit policy.json via UI: toggle rules, manage blocked paths, set thresholds |
| **Secret Types** | Pie/bar chart of secret types detected over time |
| **Timeline** | Chronological view of requests with visual risk indicators |

**Tech:** React + Vite + Tailwind CSS

---

### Phase 2 — Differentiation (Days 31–90)

---

#### F10: Smart AI Router

**Purpose:** Automatically route prompts to the safest, most cost-effective model based on detected risk level.

**Routing logic:**

```
IF risk_score >= 70       → route to local LLM (Llama 3 / Mistral / DeepSeek)
ELSE IF risk_score >= 30  → route to cloud with full redaction applied
ELSE                      → route to cloud directly
```

**Configuration:**

```json
{
  "smart_routing": {
    "enabled": true,
    "routes": [
      { "condition": "risk_score >= 70", "target": "local_llm" },
      { "condition": "risk_score >= 30", "target": "cloud_redacted" },
      { "condition": "default",          "target": "cloud_direct" }
    ],
    "local_llm": {
      "provider": "ollama",
      "model": "llama3",
      "endpoint": "http://localhost:11434"
    }
  }
}
```

**Why this matters:** No competitor provides automated sensitivity-based routing. This reduces both risk and API cost simultaneously.

---

#### F11: AI Leak Simulator

**Purpose:** Analyze a codebase or file set and generate a report of what an AI model could infer if the code were sent as context.

**Output example:**

```
=== AI Leak Simulation Report ===

Files analyzed: 142
Overall risk level: HIGH

Inferable information:
  [CRITICAL] Database schema — PostgreSQL, 23 tables detected
  [CRITICAL] Payment gateway — Stripe integration in src/payments/
  [HIGH]     Authentication flow — JWT + refresh tokens in src/auth/
  [HIGH]     Internal API endpoints — 47 routes mapped
  [MEDIUM]   Business logic — pricing algorithm in src/pricing/engine.ts
  [MEDIUM]   Infrastructure — AWS us-east-1, ECS deployment markers

Recommendations:
  1. Add /src/pricing/ to blocked_paths in policy.json
  2. Add /src/payments/ to blocked_paths in policy.json
  3. Enable automatic redaction for all DB connection strings
  4. Enable local LLM routing for files in /src/auth/
```

**Why this matters:** This is a completely new category. No existing tool tells developers what AI can learn from their codebase. Massive differentiation and a strong enterprise selling point.

---

#### F12: Local LLM Integration

**Purpose:** Run AI models entirely on-device so zero data leaves the machine.

**Supported runtimes:**

| Runtime | Models |
|---|---|
| Ollama | Llama 3, DeepSeek, Mistral, CodeLlama, Phi-3 |
| llama.cpp | Any GGUF model |
| LM Studio | Any model supported by LM Studio |

**Behavior:** Proxy auto-detects local LLM availability at startup. Status is displayed on the dashboard. When smart routing directs traffic to local LLM, the proxy forwards to the local endpoint using the same OpenAI-compatible API format.

---

#### F13: Reversible Tokenization (Secure Audit Mode)

**Purpose:** Replace secrets with deterministic tokens that authorized admins can reverse using a secure key. Required for forensic investigation in enterprise environments.

**Flow:**

```
Original:  "AKIAIOSFODNN7EXAMPLE"
Token:     "[VAULT_TOK_a8f3e2]"
Stored:    encrypted(original, org_master_key) → secure local vault
```

Only admins with the org master key can reverse the token. This satisfies enterprise audit requirements without risking raw secret storage in logs.

**Storage:** OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service) or AES-256 encrypted file with TTL-based expiry.

---

#### F14: Per-Project Policy Profiles

**Purpose:** Allow different policy configurations per project/repository.

**Detection logic:**
1. Check for `.aifirewall.json` in project root
2. If found, merge with global `policy.json` (project rules take precedence)
3. If not found, fall back to global `policy.json`

This allows teams to define stricter rules for sensitive repos (e.g., payment service) and relaxed rules for public/open-source repos.

---

#### F15: ML-Assisted Secondary Scanner

**Purpose:** Reduce false positives and catch secrets that don't match regex patterns.

**Approach:**
- Lightweight distilled transformer classifier running as optional sidecar service
- Entropy-based detection: flag high-entropy strings that may be secrets even without pattern match
- Context-aware scoring: `password = "test123"` in a test file scores lower than the same in a production config

**Pipeline:** Regex scanner → ML classifier → contextual heuristic → final decision

---

### Phase 3 — Enterprise (Days 91–180)

---

#### F16: Organization Dashboard

- Multi-user support: invite team members with email
- Aggregated risk posture across all developers in the org
- Per-developer activity view (anonymizable for privacy)
- Policy push: admins define policies that auto-distribute to all local agents
- Trend analytics: risk over time, most common secret types, top offenders

---

#### F17: Role-Based Access Control (RBAC)

| Role | Permissions |
|---|---|
| **Admin** | Full control — policy management, user management, audit access, billing |
| **Security Lead** | View all logs, manage policies, export reports; no billing access |
| **Developer** | View own logs, configure personal overrides within org policy limits |
| **Auditor** | Read-only access to logs, reports, and compliance exports |

---

#### F18: Compliance & Audit Exports

- Export logs as CSV, JSON, or formatted PDF reports
- SOC 2 evidence generation templates
- GDPR data handling proof documentation
- HIPAA audit trail exports
- Configurable retention periods (30 / 60 / 90 / 365 days)
- Automated scheduled report generation

---

#### F19: Air-Gapped Deployment

- Single binary or Docker image with all dependencies bundled
- No internet connectivity required for any functionality
- Local LLM pre-bundled or side-loadable via USB / internal artifact repo
- Updates delivered via signed packages through internal distribution

---

#### F20: CI/CD Integration

- **Pre-commit hook:** Scan staged code for secrets before allowing commit
- **GitHub Action / GitLab CI step:** Scan pull requests for AI-leakable content
- **CLI tool:** `aifirewall scan ./src --report` for on-demand scanning
- **Webhook integration:** Post scan results to Slack, Teams, or custom endpoints

---

#### F21: AI Permission Prompt (Interactive Mode)

Before sending any flagged request, prompt the developer interactively:

```
┌─────────────────────────────────────────┐
│  AI Firewall — Sensitive Data Detected  │
│                                         │
│  File: src/payments/stripe.ts           │
│  Secrets: 1 API key, 1 DB URL          │
│  Risk Score: 78 / 100                   │
│                                         │
│  [Allow Once] [Redact & Send] [Block]   │
│  [ ] Remember for this file             │
└─────────────────────────────────────────┘
```

Configurable via `"interactive_mode": true` in policy.json. Defaults to off (auto-apply policy).

---

## 6. System Architecture

### 6.1 MVP Architecture (Phase 1)

```
VS Code / Browser / CLI
         │
         ▼
  ┌──────────────────────────────┐
  │  AI Firewall Proxy           │
  │  (localhost:8080)            │
  │                              │
  │  ┌────────────────────────┐  │
  │  │ Request Interceptor    │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ Scanner Pipeline       │  │
  │  │  ├── Secret Scanner    │  │
  │  │  └── PII Scanner       │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ Policy Engine          │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ Redactor               │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ Logger (SQLite)        │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ Request Forwarder      │  │
  │  └──────────┬─────────────┘  │
  └─────────────┼────────────────┘
                ▼
       AI Provider API
  (OpenAI / Anthropic / Google)
```

### 6.2 Full Architecture (Phase 3)

```
Developer Machine                            Organization Layer
┌─────────────────────────┐                 ┌───────────────────────────┐
│  VS Code Extension      │                 │  Org Dashboard            │
│  Browser Extension      │                 │  Policy Distribution      │
│  CLI Tool               │                 │  Aggregated Analytics     │
│  Pre-commit Hook        │                 │  RBAC                     │
└───────────┬─────────────┘                 │  Compliance Reports       │
            ▼                               └────────────┬──────────────┘
┌─────────────────────────┐                              │
│  Local AI Firewall      │◄──── policy sync ────────────┘
│  Proxy Agent            │
│                         │
│  Scanner Pipeline:      │
│   Regex → ML → Context  │
│                         │──────► SQLite (local logs)
│  Policy Engine          │──────► Secure Vault (reversible tokens)
│                         │
│  Smart Router           │
│   ├──► Local LLM        │
│   └──► Cloud AI         │
└─────────────────────────┘
```

### 6.3 Request Flow Diagram

```
[Developer types prompt in VS Code]
            │
            ▼
[VS Code Extension intercepts request]
            │
            ▼
[Redirects to localhost:8080 instead of api.openai.com]
            │
            ▼
[Proxy receives request]
            │
            ▼
[Extract messages[].content from request body]
            │
            ▼
[Secret Scanner: run all regex patterns]
            │
            ▼
[PII Scanner: run all PII patterns]
            │
            ▼
[Policy Engine: evaluate scan results against policy.json]
            │
            ├──► BLOCK → return HTTP 403 + log
            │
            ├──► REDACT → replace matches → forward cleaned prompt → log
            │
            └──► ALLOW → forward original prompt → log
                    │
                    ▼
          [AI Provider returns response]
                    │
                    ▼
          [Proxy returns response to VS Code]
```

---

## 7. Technology Stack

### 7.1 Stack Overview

| Layer | Technology | Rationale |
|---|---|---|
| **Proxy server** | Node.js 20+ / TypeScript / Fastify | Fast, lightweight, large ecosystem |
| **Secret scanning** | Custom regex engine + gitleaks patterns | No external dependency for MVP |
| **PII scanning** | Regex (MVP) → Microsoft Presidio (Phase 2) | Presidio is best-in-class for PII |
| **Policy engine** | JSON config + TypeScript evaluator | Simple, portable, version-controllable |
| **Database** | SQLite via better-sqlite3 | Zero setup, local-only, fast |
| **Dashboard** | React + Vite + Tailwind CSS | Modern, fast build, great DX |
| **VS Code extension** | TypeScript + VS Code Extension API | Native integration |
| **Browser extension** | TypeScript + Chrome Extension Manifest V3 | Cross-browser support |
| **Local LLM runtime** | Ollama / llama.cpp | Industry standard for local inference |
| **Local agent (future)** | Rust | Performance + memory safety for background service |
| **CLI tool** | TypeScript compiled with pkg or Bun | Single portable binary |

### 7.2 MVP Dependencies

```json
{
  "dependencies": {
    "fastify": "^4.x",
    "axios": "^1.x",
    "better-sqlite3": "^9.x",
    "dotenv": "^16.x",
    "zod": "^3.x",
    "crypto": "built-in"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "ts-node": "^10.x",
    "nodemon": "^3.x",
    "eslint": "^8.x",
    "vitest": "^1.x",
    "@types/better-sqlite3": "^7.x"
  }
}
```

---

## 8. Project Structure

```
ai-firewall/
│
├── proxy/                              # Core proxy server
│   ├── src/
│   │   ├── server.ts                   # Fastify server entry point
│   │   ├── config.ts                   # Env + policy config loader
│   │   │
│   │   ├── routes/
│   │   │   ├── ai.route.ts            # POST /v1/chat/completions
│   │   │   ├── logs.route.ts          # GET /api/logs (dashboard API)
│   │   │   └── health.route.ts        # GET /health
│   │   │
│   │   ├── scanner/
│   │   │   ├── secretScanner.ts       # Regex-based secret detection
│   │   │   ├── piiScanner.ts          # Regex-based PII detection
│   │   │   └── patterns.ts           # All regex patterns centralized
│   │   │
│   │   ├── policy/
│   │   │   └── policyEngine.ts        # Rule evaluation logic
│   │   │
│   │   ├── redactor/
│   │   │   └── redactor.ts            # Text replacement logic
│   │   │
│   │   ├── router/
│   │   │   └── aiRouter.ts           # Smart model routing (Phase 2)
│   │   │
│   │   ├── logger/
│   │   │   └── logger.ts             # SQLite write operations
│   │   │
│   │   ├── db/
│   │   │   └── database.ts           # SQLite initialization + schema
│   │   │
│   │   └── types/
│   │       └── index.ts              # Shared TypeScript types
│   │
│   ├── policy.json                    # Default policy configuration
│   ├── package.json
│   └── tsconfig.json
│
├── dashboard/                          # Web-based monitoring UI
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── pages/
│   │   │   ├── Overview.tsx
│   │   │   ├── Logs.tsx
│   │   │   ├── RiskScore.tsx
│   │   │   └── Settings.tsx
│   │   └── components/
│   │       ├── RequestTable.tsx
│   │       ├── RiskBadge.tsx
│   │       ├── PolicyToggle.tsx
│   │       └── Chart.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── vscode-extension/                   # VS Code integration
│   ├── src/
│   │   ├── extension.ts              # Extension entry point
│   │   ├── statusBar.ts             # Status bar indicator
│   │   └── commands.ts              # Command palette commands
│   └── package.json
│
├── browser-extension/                  # Chrome/Firefox extension
│   ├── manifest.json
│   ├── background.ts                 # Service worker
│   ├── popup.tsx                     # Extension popup UI
│   └── content.ts                    # Page injection script
│
├── cli/                               # Command-line scanner tool
│   ├── src/
│   │   └── index.ts                  # aifirewall scan / aifirewall status
│   └── package.json
│
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## 9. Development Plan & Timeline

### Phase 1 — MVP (30 days, solo developer)

| Week | Deliverables | Est. Days |
|---|---|---|
| **Week 1** | Proxy server (Fastify) + secret scanner + request forwarding to OpenAI | 5 |
| **Week 2** | PII scanner + redaction engine + policy engine + SQLite logging | 5 |
| **Week 3** | Dashboard UI (React + Tailwind) + risk score display + log viewer | 5 |
| **Week 4** | VS Code extension + browser extension + end-to-end testing + packaging | 5 |

**Phase 1 exit criteria:**
- Proxy runs on localhost:8080 and accepts OpenAI-compatible requests
- All 10+ secret patterns detected with >95% accuracy on test data
- Redaction replaces secrets with typed tokens correctly
- Dashboard renders logs with <1s load time
- VS Code extension installs and redirects traffic through proxy
- Zero raw secrets found in SQLite after 1000 test requests

### Phase 2 — Differentiation (60 days, 1–2 developers)

| Weeks | Deliverables |
|---|---|
| **Week 5–6** | Smart AI Router + Ollama local LLM integration |
| **Week 7–8** | AI Leak Simulator (static analysis + report generation) |
| **Week 9–10** | Per-project policies + reversible tokenization |
| **Week 11–12** | ML-assisted secondary scanner (entropy + lightweight classifier) |

### Phase 3 — Enterprise (90 days, 2–3 person team)

| Month | Deliverables |
|---|---|
| **Month 4** | Organization dashboard + RBAC + policy distribution |
| **Month 5** | Compliance exports + audit trail + CI/CD hooks + CLI tool |
| **Month 6** | Air-gapped deployment + installer + enterprise hardening + documentation |

### Team Requirements

| Phase | Team |
|---|---|
| Phase 1 (MVP) | 1 full-stack engineer |
| Phase 2 | 1 backend engineer + 1 frontend engineer |
| Phase 3 | 1 backend + 1 frontend + 1 security engineer |

---

## 10. Environment & Configuration

### 10.1 Environment Variables

```env
# Server
PORT=8080
DASHBOARD_PORT=3000

# AI Provider
OPENAI_API_KEY=your_key_here
PROVIDER_URL=https://api.openai.com/v1/chat/completions

# Local LLM (Phase 2)
LOCAL_LLM_URL=http://localhost:11434
LOCAL_LLM_MODEL=llama3

# Logging
LOG_RETENTION_DAYS=90
LOG_LEVEL=info

# Security
ENCRYPTION_KEY=auto_generated_on_first_run
```

### 10.2 Policy Configuration

See `policy.json` specification in [Feature F4](#f4-policy-engine).

### 10.3 Per-Project Override

Place `.aifirewall.json` in project root to override global settings:

```json
{
  "extends": "global",
  "rules": {
    "block_db_urls": true,
    "allow_source_code": false
  },
  "blocked_paths": [
    "/src/payments/",
    "/src/auth/secrets/"
  ]
}
```

---

## 11. API Specification

### 11.1 Proxy Endpoint

**`POST /v1/chat/completions`**

OpenAI-compatible. Accepts the same request format as `https://api.openai.com/v1/chat/completions`.

**Request:**

```http
POST /v1/chat/completions HTTP/1.1
Host: localhost:8080
Content-Type: application/json
Authorization: Bearer OPENAI_API_KEY

{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Fix this code. My key is AKIAIOSFODNN7EXAMPLE"
    }
  ]
}
```

**Response (success — redacted):**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Here is the fixed code..."
      }
    }
  ],
  "_firewall": {
    "action": "REDACT",
    "secrets_found": 1,
    "risk_score": 65
  }
}
```

**Response (blocked):**

```http
HTTP/1.1 403 Forbidden

{
  "error": "Request blocked due to sensitive data",
  "code": "FIREWALL_BLOCKED",
  "reasons": ["Private key detected"],
  "risk_score": 95
}
```

### 11.2 Dashboard API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/logs` | Paginated request logs (query: `?page=1&limit=50&action=BLOCK`) |
| `GET` | `/api/logs/:id` | Single log entry detail |
| `GET` | `/api/stats` | Aggregated statistics (total, blocked, redacted, risk trend) |
| `GET` | `/api/risk-score` | Current project risk score |
| `GET` | `/api/policy` | Current policy configuration |
| `PUT` | `/api/policy` | Update policy configuration |
| `GET` | `/health` | Proxy health check |

---

## 12. Performance & Security Requirements

### 12.1 Performance Targets

| Metric | Target |
|---|---|
| Scan latency overhead | <50ms per request |
| Memory usage (proxy) | <200MB |
| SQLite write latency | <5ms per log entry |
| Dashboard initial load | <1s |
| Concurrent request handling | 50+ simultaneous |
| Regex pattern evaluation | <10ms for all patterns combined |
| Maximum prompt size supported | 500KB |

### 12.2 Security Requirements

| Requirement | Implementation |
|---|---|
| No raw secrets stored | Store only sanitized text + SHA-256 hash of original |
| Local-only by default | All data stays on machine; zero telemetry; no phone-home |
| Encrypted vault (Phase 2) | OS keychain or AES-256 encrypted file for reversible tokens |
| No external network calls from scanner | Scanner runs fully offline; only the forwarder contacts AI providers |
| Extension permissions | Minimal: only intercept AI provider URLs, no broad network access |
| HTTPS support (optional) | Self-signed cert for localhost proxy if required by org policy |
| Input validation | All incoming requests validated with Zod before processing |

---

## 13. Testing Strategy

### 13.1 Test Levels

| Level | Tool | Scope |
|---|---|---|
| **Unit tests** | Vitest | Scanner patterns, policy logic, redactor, logger |
| **Integration tests** | Vitest + Supertest (light-my-request) | Full proxy request flow end-to-end |
| **Extension tests** | VS Code Extension Test Runner | Activation, command registration, status bar |
| **Manual QA** | curl + dashboard | Full flow validation with real prompts |
| **Security tests** | Custom test suite | Verify no raw secrets in logs, DB, responses, or error messages |

### 13.2 Critical Test Cases

| # | Test Case | Expected Result |
|---|---|---|
| 1 | AWS key in prompt | BLOCKED, HTTP 403 returned |
| 2 | JWT in prompt | REDACTED, token replaced, prompt forwarded |
| 3 | Clean prompt with no secrets | ALLOWED, forwarded unchanged, logged |
| 4 | Private key in prompt | BLOCKED, HTTP 403 returned |
| 5 | Mixed content (secret + safe text) | Secret redacted, rest forwarded intact |
| 6 | Email address in prompt | REDACTED (if policy enabled), forwarded |
| 7 | Empty prompt | ALLOWED, forwarded, logged |
| 8 | Very large prompt (100KB+) | Handled within <50ms latency target |
| 9 | Multiple secrets of different types | All detected, highest severity action applied |
| 10 | Database URL in prompt | BLOCKED |
| 11 | SQLite log check after 1000 requests | Zero raw secrets in any row |
| 12 | Policy toggle off → secret in prompt | ALLOWED (policy respected) |
| 13 | Malformed request body | HTTP 400 with clear error, no crash |
| 14 | AI provider timeout | Graceful error returned to client, logged |

### 13.3 Test Data

Maintain a `test/fixtures/` directory with:
- `secrets.txt` — sample prompts containing each secret type
- `clean.txt` — sample prompts with no secrets
- `mixed.txt` — prompts with partial sensitive content
- `edge-cases.txt` — unicode, very long strings, nested patterns

---

## 14. Monetization Strategy

### 14.1 Pricing Tiers

| Tier | Price | Features |
|---|---|---|
| **Free / Open Source** | $0 | Local proxy, basic scanning (5 patterns), SQLite logs, CLI |
| **Pro (Individual)** | $8–15/month | Full pattern library (25+), dashboard, browser extension, smart routing config |
| **Team** | $30–60/user/month | Shared policies, team dashboard, priority support, per-project profiles |
| **Enterprise** | Custom ($1K–10K/year) | RBAC, compliance exports, air-gapped deploy, SSO, SLA, dedicated support |

### 14.2 Business Model

**Open-core:** Core proxy + scanner is open source (builds community, trust, and adoption). Dashboard, smart routing, enterprise features, and advanced scanner are paid.

### 14.3 Revenue Projections (Conservative)

| Milestone | Timeline | Est. MRR |
|---|---|---|
| 100 free users, 10 Pro | Month 3 | $100–150 |
| 500 free, 50 Pro, 5 Team | Month 6 | $1,500–3,000 |
| 2000 free, 200 Pro, 20 Team, 2 Enterprise | Month 12 | $10,000–20,000 |

---

## 15. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | **False positives** annoy developers, hurt adoption | High | High | Tunable sensitivity levels; "always allow for this file" option; interactive mode; per-project profiles |
| 2 | **False negatives** miss real secrets | Critical | Medium | Layered scanning (regex → entropy → ML); community-contributed patterns; regular pattern updates |
| 3 | **AI providers change API formats** | Medium | Medium | Abstract provider interface with version-pinned adapters; monitor provider changelogs |
| 4 | **Large prompts cause latency** spikes | Medium | Medium | Stream-based scanning; async pipeline; early termination on block decision |
| 5 | **Competitors add similar features** | High | High | Ship fast; build community moat; focus on leak simulator + smart routing as defensible differentiators |
| 6 | **Enterprise sales cycle is long** | Medium | High | Land with free/pro tier; expand to enterprise via bottom-up developer adoption |
| 7 | **Local LLM quality varies** by hardware | Medium | Medium | Curate recommended models; publish benchmark scores; graceful fallback to cloud |
| 8 | **Regex maintenance burden** grows over time | Low | High | Centralized pattern file; automated pattern testing in CI; community contributions |
| 9 | **VS Code extension conflicts** with other AI tools | Medium | Medium | Minimal footprint; only override API base URL; test against top 10 AI extensions |
| 10 | **Data breach of local logs** | Critical | Low | Encrypt SQLite at rest (optional); never store raw secrets; hash-only for originals |

---

## 16. Success Metrics

### MVP Launch (Day 30)

| Metric | Target |
|---|---|
| Proxy handles requests without failure | 1000+ sequential requests, 0 crashes |
| Secret pattern accuracy | >95% detection rate on test fixtures |
| Dashboard renders logs | <1s load time |
| VS Code extension functional | Installs, redirects traffic, shows status |
| Raw secret leakage in storage | Zero instances in SQLite after 1000 requests |

### Phase 2 Completion (Day 90)

| Metric | Target |
|---|---|
| Smart router classification accuracy | >90% correct routing decisions |
| Leak simulator report generation | Works for 3+ real-world project structures |
| Beta user count | 100+ developers using free tier |
| Community pattern contributions | 5+ external pattern submissions |

### Phase 3 Completion (Day 180)

| Metric | Target |
|---|---|
| Enterprise pilot customers | 3+ organizations |
| Compliance export validation | SOC 2 evidence accepted by auditor |
| Air-gapped deployment test | Fully functional in isolated environment |
| Uptime (proxy) | 99.9% on developer machines |

---

## 17. Additional Recommendations

These are features and strategies beyond the core roadmap that strengthen the product's competitive position:

### 17.1 Entropy-Based Detection

Catch secrets that don't match any known regex pattern by measuring string randomness. A high-entropy string (e.g., `a8f3kL9mNq2xP7vR`) longer than 20 characters adjacent to keywords like `key`, `secret`, `token` is very likely a credential. This dramatically reduces false negatives.

### 17.2 Context-Aware Scanning

Understand that `password = "test123"` in a test file is different from `password = "Pr0d$ecret!"` in a production config. Use file path context (test vs. src), variable naming conventions, and surrounding code to adjust severity scoring.

### 17.3 Prompt Fingerprinting & Deduplication

Hash and deduplicate repeated prompts to:
- Show developers when they are repeatedly sending the same sensitive content
- Reduce unnecessary scans for identical prompts
- Surface patterns in AI usage (e.g., "you send payment code 12x/day")

### 17.4 Community Pattern Registry

Allow users to contribute, share, and subscribe to detection pattern sets. Structure as a `patterns.d/` directory with loadable pattern files. This builds a defensible community moat similar to how Snyk and YARA rules work.

### 17.5 "What Would AI See?" Preview

Before any prompt is sent, offer a diff-like preview showing original vs. sanitized content side-by-side. Developers see exactly what will leave their machine. This builds trust and reduces anxiety about AI tool usage.

### 17.6 Metrics Webhooks / SIEM Integration

Allow enterprises to pipe scan metrics to existing monitoring infrastructure (Splunk, Datadog, ELK, PagerDuty) via configurable webhooks or syslog output. This is often a hard requirement for enterprise procurement.

### 17.7 VS Code CodeLens Integration

Show inline annotations above functions or files that contain sensitive patterns:

```
⚠ AI Firewall: 3 secrets detected — will be redacted before AI access
function processPayment(stripeKey: string, amount: number) {
```

This makes developers aware of sensitive content before they even invoke an AI tool.

### 17.8 Scheduled Codebase Scans

Run a background scan of the full workspace on a configurable schedule (e.g., every 6 hours) and update the dashboard risk score. This provides continuous posture monitoring even when no AI requests are being made.

### 17.9 Exportable Scanner Package

Design the scanner and policy engine as a standalone, importable npm package (`@aifirewall/scanner`) so other tools — CI systems, other IDEs, custom applications — can embed scanning without running the full proxy server.

### 17.10 Onboarding & Policy Templates

Ship pre-built policy templates for common stacks:

| Template | Blocked Patterns | Use Case |
|---|---|---|
| `node-web` | DB URLs, JWT, .env, npm tokens | Node.js web apps |
| `python-ml` | API keys, notebook outputs, model weights paths | Python ML projects |
| `infrastructure` | Cloud credentials, SSH keys, Terraform state | DevOps / IaC repos |
| `fintech` | All PII, payment keys, internal endpoints | Financial services |
| `healthcare` | All PII, HIPAA identifiers, medical record patterns | Healthcare orgs |

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| **AI Firewall** | The complete product: proxy + scanner + policy engine + extensions |
| **Proxy** | The Fastify server that intercepts and forwards AI requests |
| **Scanner** | The detection pipeline (secret scanner + PII scanner) |
| **Policy Engine** | Rule evaluator that decides ALLOW / BLOCK / REDACT |
| **Redactor** | Component that replaces sensitive content with tokens |
| **Smart Router** | Logic that directs prompts to local or cloud AI based on risk |
| **Leak Simulator** | Tool that analyzes what AI could infer from a codebase |
| **Risk Score** | 0–100 numeric score representing sensitivity of a prompt or project |

## Appendix B: Startup Commands

```bash
# Install dependencies
cd ai-firewall/proxy && npm install

# Start proxy in development mode
npm run dev
# → AI Firewall running on http://localhost:8080

# Start dashboard
cd ai-firewall/dashboard && npm install && npm run dev
# → Dashboard running on http://localhost:3000

# Test with curl
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "My key is AKIAIOSFODNN7EXAMPLE"}]
  }'
# → Expected: redacted or blocked response
```

## Appendix C: Definition of Done

### Phase 1 is complete when:

- [ ] Proxy server runs on localhost:8080 and accepts OpenAI-compatible requests
- [ ] Secret scanner detects all 10+ defined patterns
- [ ] PII scanner detects email, phone, and national ID patterns
- [ ] Policy engine evaluates rules from policy.json and returns correct decisions
- [ ] Redactor replaces secrets with typed placeholder tokens
- [ ] Logger writes sanitized entries to SQLite with zero raw secret leakage
- [ ] Dashboard displays logs, risk score, and policy settings
- [ ] VS Code extension redirects AI traffic through proxy
- [ ] Browser extension intercepts web-based AI tool requests
- [ ] All critical test cases pass
- [ ] Performance targets met (<50ms overhead, <200MB memory)

---





Version 2



# AI Firewall — Product & Development Documentation

> **Version:** v1.1.0-draft
> **Last Updated:** February 18, 2026
> **Status:** Pre-Development

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Vision & Mission](#2-vision--mission)
3. [Competitive Landscape](#3-competitive-landscape)
4. [Product Scope](#4-product-scope)
5. [Feature Specification](#5-feature-specification)
   - [Phase 1 — MVP (Core Firewall)](#phase-1--mvp-days-130)
   - [Phase 2 — Differentiation](#phase-2--differentiation-days-3190)
   - [Phase 3 — Enterprise](#phase-3--enterprise-days-91180)
   - [Phase 4 — AI Gateway Platform](#phase-4--ai-gateway-platform-days-181240)
6. [System Architecture](#6-system-architecture)
7. [Technology Stack](#7-technology-stack)
8. [Project Structure](#8-project-structure)
9. [Development Plan & Timeline](#9-development-plan--timeline)
10. [Environment & Configuration](#10-environment--configuration)
11. [API Specification](#11-api-specification)
12. [Database Schema (All Phases)](#12-database-schema-all-phases)
13. [Performance & Security Requirements](#13-performance--security-requirements)
14. [Testing Strategy](#14-testing-strategy)
15. [Monetization Strategy](#15-monetization-strategy)
16. [Risks & Mitigations](#16-risks--mitigations)
17. [Success Metrics](#17-success-metrics)
18. [Additional Recommendations](#18-additional-recommendations)

---

## 1. Product Overview

### 1.1 What Is AI Firewall?

AI Firewall is a **local-first AI security gateway** that sits between developer tools (VS Code, browsers, CLI, apps) and AI providers (OpenAI, Anthropic, Google, local LLMs). It intercepts every AI-bound request, scans for secrets, PII, and sensitive business logic, then blocks, redacts, or forwards the cleaned prompt — all before data ever leaves the developer's machine.

In its final form, AI Firewall evolves into a **full AI Gateway Platform** where users bring their own API keys and subscriptions, choose between multiple AI models, and the platform enforces credit limits, usage tracking, and cost control — all while maintaining the security layer underneath.

### 1.2 Positioning

> **"Cloudflare for AI Requests — Protect developers from AI data leaks."**

This is not an AI coding assistant. This is an **AI security layer + AI gateway** — a fundamentally different product category targeting the gap between developer productivity tools and enterprise security requirements.

### 1.3 Problem Statement

Every day, millions of developers send code, credentials, and proprietary logic to cloud AI models without visibility or control. Existing AI coding tools (Copilot, Cursor, Codeium) optimize for speed, not security. There is no universal, local-first firewall layer that:

- Shows developers exactly what data is being sent to AI
- Blocks secrets, keys, tokens, and PII automatically
- Routes sensitive prompts to local models and safe prompts to cloud models
- Gives enterprises auditable, policy-driven control over AI usage
- Lets users bring their own keys, control which models are used, and enforce usage limits
- Scans only the files that matter — not the entire codebase indiscriminately

### 1.4 Solution

A lightweight, local proxy + extension ecosystem that provides:

- **Real-time interception** and scanning of all AI requests
- **Automatic detection**, redaction, and blocking of secrets and PII
- **Scoped scanning** — only scan targeted files and directories, never the entire codebase blindly
- **Full request visibility** and local audit logging
- **Smart routing** between local and cloud AI models based on sensitivity
- **Enterprise policy engine** with per-project, per-team, and per-org rules
- **AI Gateway** with BYOK (Bring Your Own Key), multi-model support, credit limits, and usage tracking

### 1.5 Target Users

| Priority | Segment | Why They Need It | Willingness to Pay |
|---|---|---|---|
| 1 | Enterprises (banks, govt, healthcare) | Regulatory compliance, IP protection, cost control | Very High |
| 2 | Mid-size tech companies | Protect proprietary code and infra, manage AI spend | High |
| 3 | Security-conscious startups | Prevent credential leaks at scale | Medium–High |
| 4 | Development agencies | Client code confidentiality, per-client AI budgets | Medium |
| 5 | Freelancers / individual devs | Personal key protection, usage tracking | Low–Medium |

### 1.6 Product Evolution

```
Phase 1: AI Firewall       → Security layer (scan, block, redact)
Phase 2: Smart Firewall    → Intelligence layer (routing, simulation, ML)
Phase 3: Enterprise        → Org layer (RBAC, compliance, air-gap)
Phase 4: AI Gateway        → Platform layer (BYOK, credits, multi-model, subscriptions)
```

---

## 2. Vision & Mission

**Vision:** Every AI interaction is secure by default — no secrets leak, no data is sent without consent, every developer has full visibility into what AI sees, and organizations have complete control over AI model usage and spend.

**Mission:** Build the industry-standard AI security and gateway platform that developers and enterprises trust to protect their code, control their AI usage, and manage their AI costs.

---

## 3. Competitive Landscape

### 3.1 Direct Competitors — AI Coding Tools

| Competitor | What They Do | Their Weakness |
|---|---|---|
| GitHub Copilot Enterprise | AI coding with org controls | No local-first proxy; limited transparency; no BYOK; no credit control |
| Cursor Enterprise | AI-native IDE with team features | Cloud-dependent; no standalone security layer; no multi-model gateway |
| Codeium | AI code completion | Minimal secret protection; no firewall concept; no usage limits |
| Sourcegraph Cody | AI code search + generation | No dedicated DLP / security gateway; no credit management |

### 3.2 AI Security Platforms

| Competitor | What They Do | Their Weakness |
|---|---|---|
| Microsoft Purview | Enterprise data governance | Heavy, expensive, not developer-focused |
| Palo Alto Networks AI Security | Network-level AI controls | Enterprise-only, no IDE integration |
| Zscaler | Cloud security gateway | No developer tooling; network-level only |

### 3.3 Major Gaps We Exploit

| Gap | Detail |
|---|---|
| No full transparency | Users don't know what data Copilot/Cursor sends; can't fully control it |
| No local control layer | Most tools send data directly to cloud with no local filtering or routing |
| No fine-grained secret protection | They may catch passwords (basic) but not business logic, proprietary algorithms, internal APIs |
| No AI firewall concept | There is no AI request firewall or AI data leak prevention system purpose-built for developers |
| No BYOK + credit control | No tool lets users bring their own keys, choose models, AND enforce usage limits locally |
| No file scope control | AI tools scan entire projects indiscriminately; no way to restrict which files AI can access |

### 3.4 Our Key Differentiators

1. **Local-first architecture** — data never leaves the machine without validation
2. **Developer-native** — VS Code extension, CLI, browser extension (not a network appliance)
3. **Smart AI routing** — auto-routes sensitive code to local LLM, safe code to cloud
4. **AI Leak Simulator** — shows what AI can infer from your codebase (no competitor does this)
5. **Lightweight + fast** — <50ms overhead, <200MB memory
6. **Offline-capable** — works in air-gapped, regulated environments
7. **File scope control** — scan only what's needed, never blindly crawl the entire codebase
8. **BYOK + multi-model gateway** — users bring their own API keys, choose models, and control spend
9. **Credit & usage management** — per-provider limits, token tracking, cost dashboards

---

## 4. Product Scope

### 4.1 In Scope vs Out of Scope

| In Scope | Out of Scope (for now) |
|---|---|
| Local AI proxy server | Multi-tenant cloud SaaS platform |
| Secret detection engine | Advanced ML-based code analysis |
| PII detection engine | Kubernetes orchestration |
| Policy engine (JSON config) with file scoping | Enterprise SSO / SAML (Phase 3+) |
| Redaction engine | Mobile app |
| VS Code extension | IDE plugins beyond VS Code (Phase 2+) |
| Browser extension | Network-level packet inspection |
| Local dashboard (web UI) | Custom LLM training |
| SQLite logging | |
| Smart AI router (Phase 2) | |
| AI Leak Simulator (Phase 2) | |
| Multi-provider support (Phase 4) | |
| BYOK API key vault (Phase 4) | |
| Credit & usage management (Phase 4) | |
| Subscription-based model control (Phase 4) | |

### 4.2 Security Levels

| Level | Features | Target User |
|---|---|---|
| **Level 1 — Basic** | Secret scanning, proxy forwarding, file scope control | Individual developers |
| **Level 2 — Intermediate** | Redaction, policy engine, logging, dashboard | Teams / startups |
| **Level 3 — Advanced** | Local LLM routing, zero-leak architecture, leak simulator | Security-conscious orgs |
| **Level 4 — Enterprise** | RBAC, audit logs, compliance reports, encryption, air-gapped mode | Enterprises / regulated industries |
| **Level 5 — Gateway** | BYOK, multi-model, credit limits, usage tracking, subscription control | Platform / managed AI environments |

---

## 5. Feature Specification

### Phase 1 — MVP (Days 1–30)

---

#### F1: Local Secure AI Proxy (Core Engine)

**Purpose:** Central interception point for all AI-bound traffic.

| Attribute | Detail |
|---|---|
| Runtime | `localhost:8080` |
| Protocol | HTTP, OpenAI-compatible `/v1/chat/completions` |
| Framework | Fastify (Node.js / TypeScript) |
| Latency target | <50ms added overhead |
| Memory target | <200MB |

**Request lifecycle:**

```
Receive request
  → Extract prompt text from messages array
  → Check file scope (is this file/path allowed?)
  → Run secret scanner
  → Run PII scanner
  → Evaluate policy engine
  → Execute action (ALLOW / REDACT / BLOCK)
  → Log to SQLite
  → Forward cleaned prompt to AI provider (or return HTTP 403)
  → Return AI response to client
```

**Blocked request response:**

```json
{
  "error": "Request blocked due to sensitive data",
  "reasons": ["Private key detected"],
  "code": "FIREWALL_BLOCKED"
}
```

---

#### F2: Secret Detection Engine

**Purpose:** Identify credentials, keys, and tokens in prompt text using pattern matching.

**Detection targets:**

| Secret Type | Regex Pattern | Default Action | Severity |
|---|---|---|---|
| AWS Access Key | `AKIA[0-9A-Z]{16}` | Block | Critical |
| Private Key | `-----BEGIN (RSA\|EC\|DSA\|PRIVATE) KEY-----` | Block | Critical |
| JWT Token | `eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+` | Redact | High |
| Bearer Token | `Bearer\s[A-Za-z0-9\-_\.]{20,}` | Redact | High |
| Generic API Key | `(api[_-]?key\|apikey)\s*[:=]\s*['"]?[A-Za-z0-9\-_]{20,}` | Redact | High |
| Database URL | `(postgres\|mysql\|mongodb)://[^\s]+` | Block | Critical |
| .env content | `[A-Z_]{3,}=\S{8,}` (heuristic) | Redact | Medium |
| GitHub Token | `gh[pousr]_[A-Za-z0-9_]{36,}` | Block | Critical |
| Slack Token | `xox[baprs]-[A-Za-z0-9-]+` | Block | High |
| Google API Key | `AIza[0-9A-Za-z\-_]{35}` | Redact | High |
| Azure Key | `[a-zA-Z0-9+/]{86}==` | Block | Critical |
| Hardcoded Password | `(password\|passwd\|pwd)\s*[:=]\s*['"][^'"]{6,}['"]` | Redact | High |

**Interface:**

```typescript
type SecretMatch = {
  type: string;
  value: string;
  position: number;
  length: number;
  severity: "critical" | "high" | "medium";
};

type ScanResult = {
  hasSecrets: boolean;
  secrets: SecretMatch[];
};

function scanSecrets(text: string): ScanResult;
```

---

#### F3: PII Detection Engine

**Purpose:** Identify personally identifiable information in prompt text.

**Detection targets (MVP — regex-based):**

| PII Type | Pattern |
|---|---|
| Email | `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}` |
| Phone | `\+?[0-9]{10,13}` |
| Aadhaar (India) | `[2-9]{1}[0-9]{3}\s[0-9]{4}\s[0-9]{4}` |
| PAN (India) | `[A-Z]{5}[0-9]{4}[A-Z]{1}` |
| SSN (US) | `\d{3}-\d{2}-\d{4}` |
| Credit Card | `\b(?:\d[ -]*?){13,16}\b` (with Luhn validation post-match) |
| IP Address | `\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b` |

**Interface:**

```typescript
function scanPII(text: string): ScanResult;
```

---

#### F4: Policy Engine with File Scope Control

**Purpose:** Decide the action (ALLOW / BLOCK / REDACT) based on scan results and user-defined rules. Critically, also control **which files and directories** the AI is allowed to access — the scanner must never blindly crawl the entire codebase.

**Design principle:** The AI model should only see files the developer explicitly allows. Everything else is invisible to AI by default (deny-by-default) or allowed by default with specific exclusions (allow-by-default with blocklist). The mode is configurable.

**Configuration file:** `policy.json`

```json
{
  "version": "1.0",
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
    "blocklist": [
      ".env",
      ".env.*",
      "**/*.pem",
      "**/*.key",
      "**/secrets/**",
      "**/credentials/**",
      "**/config/production.*",
      "**/.git/**",
      "**/node_modules/**"
    ],
    "allowlist": [],
    "max_file_size_kb": 500,
    "scan_on_open": false,
    "scan_on_send": true
  },
  "blocked_paths": [
    "/payments/",
    "/auth/",
    "/internal/",
    "/.env"
  ],
  "severity_threshold": "medium"
}
```

**File scope modes:**

| Mode | Behavior |
|---|---|
| `blocklist` (default) | All files are allowed EXCEPT those matching blocklist globs. Best for most projects. |
| `allowlist` | ONLY files matching allowlist globs are sent to AI. Everything else is blocked. Best for high-security environments. |

**File scope enforcement points:**

1. **VS Code Extension:** Before any prompt is composed, check if referenced files are in scope. If out of scope, strip file content and warn user.
2. **Proxy:** If prompt metadata includes file paths, validate against scope before scanning. Reject out-of-scope content with clear error.
3. **Browser Extension:** No file path context available; apply secret/PII scanning only.

**Interface:**

```typescript
type PolicyDecision = {
  action: "ALLOW" | "BLOCK" | "REDACT";
  reasons: string[];
  riskScore: number;
  filesBlocked: string[];
};

type FileScopeResult = {
  allowed: boolean;
  path: string;
  reason?: string;
};

function checkFileScope(filePath: string, policy: PolicyConfig): FileScopeResult;

function evaluate(
  secretResult: ScanResult,
  piiResult: ScanResult,
  policy: PolicyConfig,
  filePaths?: string[]
): PolicyDecision;
```

**Evaluation logic:**

```
IF file path is out of scope              → BLOCK (file not allowed by policy)
IF any secret with severity "critical"    → BLOCK
IF private key detected                   → BLOCK
IF email or phone and redact enabled      → REDACT
IF risk_score > severity_threshold        → REDACT
ELSE                                      → ALLOW
```

---

#### F5: Redaction Engine

**Purpose:** Replace sensitive content with safe, typed placeholder tokens.

| Input | Output |
|---|---|
| `My key is AKIAIOSFODNN7EXAMPLE` | `My key is [REDACTED_AWS_KEY]` |
| `Email me at john@corp.com` | `Email me at [REDACTED_EMAIL]` |
| `Bearer eyJhbGciOi...` | `Bearer [REDACTED_JWT]` |
| `password = "s3cretPass!"` | `password = "[REDACTED_PASSWORD]"` |

**Interface:**

```typescript
function redact(text: string, matches: SecretMatch[]): string;
```

Tokens are stable and typed (`[REDACTED_AWS_KEY_1]`, `[REDACTED_EMAIL_2]`) so analytics can count by category without exposing actual values.

---

#### F6: SQLite Logger

**Purpose:** Local audit trail of every AI interaction.

**Schema:**

```sql
CREATE TABLE logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       INTEGER NOT NULL,
  model           TEXT NOT NULL,
  provider        TEXT NOT NULL,
  original_hash   TEXT NOT NULL,
  sanitized_text  TEXT NOT NULL,
  secrets_found   INTEGER DEFAULT 0,
  pii_found       INTEGER DEFAULT 0,
  files_blocked   INTEGER DEFAULT 0,
  risk_score      INTEGER DEFAULT 0,
  action          TEXT NOT NULL,
  reasons         TEXT,
  response_time_ms INTEGER
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_action ON logs(action);
```

**Critical security rule:** Never store raw secrets. Store only the sanitized version and a SHA-256 hash of the original prompt for deduplication and forensics.

---

#### F7: VS Code Extension

**Purpose:** Redirect AI tool traffic through the local proxy and surface warnings in-editor. Enforce file scope before prompts are even composed.

**Capabilities:**

- Override `openai.apiBase` and equivalent config settings to point to `localhost:8080`
- **File scope enforcement:** Before composing any prompt, check referenced files against policy.json file_scope rules. Strip out-of-scope file content before it reaches the proxy.
- Show notification when a request is blocked: *"AI Firewall: Secret detected. Request blocked."*
- Show notification when files are excluded: *"AI Firewall: 3 files excluded by scope policy."*
- Show inline indicator when a request was redacted
- Status bar icon with color state:
  - Green: clean request sent
  - Yellow: request was redacted or files were scoped out
  - Red: request was blocked
- Command palette commands:
  - `AI Firewall: View Dashboard`
  - `AI Firewall: View Logs`
  - `AI Firewall: Toggle Scanning`
  - `AI Firewall: Show Risk Score`
  - `AI Firewall: Show File Scope` — displays which files are allowed/blocked for AI

---

#### F8: Browser Extension

**Purpose:** Intercept AI requests from web-based tools (ChatGPT, Claude, Gemini web interfaces).

**Intercept targets:**

- `api.openai.com`
- `api.anthropic.com`
- `generativelanguage.googleapis.com`

**Capabilities:**

- Redirect matching requests through local proxy
- Badge icon showing scan status (clean / redacted / blocked)
- Popup with summary of last N requests and their actions
- Content script banner injected into AI chat pages: *"AI Firewall active — 2 secrets redacted"*

---

#### F9: Local Dashboard (Web UI)

**Purpose:** Visual overview of AI request history, risk posture, file scope, and policy configuration.

**URL:** `http://localhost:3000`

**Views:**

| View | Content |
|---|---|
| **Overview** | Total requests today/week/month, blocked %, redacted %, risk trend chart |
| **Request Log** | Sortable/filterable table: timestamp, model, action, risk score, expandable details |
| **Risk Score** | Project safety score (0–100), breakdown by secret type and severity |
| **File Scope** | Visual tree of project files: green (allowed), red (blocked), with toggle controls |
| **Policy Config** | Edit policy.json via UI: toggle rules, manage blocked paths, set thresholds, configure file scope |
| **Secret Types** | Pie/bar chart of secret types detected over time |
| **Timeline** | Chronological view of requests with visual risk indicators |

**Tech:** React + Vite + Tailwind CSS

---

### Phase 2 — Differentiation (Days 31–90)

---

#### F10: Smart AI Router

**Purpose:** Automatically route prompts to the safest, most cost-effective model based on detected risk level.

**Routing logic:**

```
IF risk_score >= 70       → route to local LLM (Llama 3 / Mistral / DeepSeek)
ELSE IF risk_score >= 30  → route to cloud with full redaction applied
ELSE                      → route to cloud directly
```

**Configuration:**

```json
{
  "smart_routing": {
    "enabled": true,
    "routes": [
      { "condition": "risk_score >= 70", "target": "local_llm" },
      { "condition": "risk_score >= 30", "target": "cloud_redacted" },
      { "condition": "default",          "target": "cloud_direct" }
    ],
    "local_llm": {
      "provider": "ollama",
      "model": "llama3",
      "endpoint": "http://localhost:11434"
    }
  }
}
```

**Why this matters:** No competitor provides automated sensitivity-based routing. This reduces both risk and API cost simultaneously. This also lays the groundwork for Phase 4's multi-provider model router.

**Architectural note:** The router interface is designed to be provider-agnostic from day one. In Phase 2 it routes between "local" and "cloud (single key)". In Phase 4 it routes between multiple user-configured providers with their own keys and credit limits.

---

#### F11: AI Leak Simulator

**Purpose:** Analyze a codebase or file set and generate a report of what an AI model could infer if the code were sent as context.

**File scope integration:** The simulator respects file scope rules. It only analyzes files within the allowed scope, and separately reports what risk exists in out-of-scope files if they were accidentally sent.

**Output example:**

```
=== AI Leak Simulation Report ===

Files analyzed: 142 (in scope)
Files excluded: 38 (out of scope by policy)
Overall risk level: HIGH

Inferable information (from in-scope files):
  [CRITICAL] Database schema — PostgreSQL, 23 tables detected
  [HIGH]     Internal API endpoints — 47 routes mapped
  [MEDIUM]   Business logic — pricing algorithm in src/pricing/engine.ts

Out-of-scope file risk (if accidentally sent):
  [CRITICAL] Payment gateway — Stripe keys in src/payments/stripe.ts
  [CRITICAL] Auth secrets — JWT signing key in src/auth/config.ts

Recommendations:
  1. Verify src/pricing/ should remain in-scope
  2. Confirm file_scope blocklist includes src/payments/
  3. Enable local LLM routing for files in src/auth/
```

---

#### F12: Local LLM Integration

**Purpose:** Run AI models entirely on-device so zero data leaves the machine.

**Supported runtimes:**

| Runtime | Models |
|---|---|
| Ollama | Llama 3, DeepSeek, Mistral, CodeLlama, Phi-3 |
| llama.cpp | Any GGUF model |
| LM Studio | Any model supported by LM Studio |

**Behavior:** Proxy auto-detects local LLM availability at startup. Status is displayed on the dashboard. When smart routing directs traffic to local LLM, the proxy forwards to the local endpoint using the same OpenAI-compatible API format.

---

#### F13: Reversible Tokenization (Secure Audit Mode)

**Purpose:** Replace secrets with deterministic tokens that authorized admins can reverse using a secure key. Required for forensic investigation in enterprise environments.

**Flow:**

```
Original:  "AKIAIOSFODNN7EXAMPLE"
Token:     "[VAULT_TOK_a8f3e2]"
Stored:    encrypted(original, org_master_key) → secure local vault
```

Only admins with the org master key can reverse the token. This satisfies enterprise audit requirements without risking raw secret storage in logs.

**Storage:** OS keychain (macOS Keychain / Windows Credential Manager / Linux Secret Service) or AES-256 encrypted file with TTL-based expiry.

---

#### F14: Per-Project Policy Profiles

**Purpose:** Allow different policy configurations (including file scope rules) per project/repository.

**Detection logic:**
1. Check for `.aifirewall.json` in project root
2. If found, deep-merge with global `policy.json` (project rules take precedence)
3. If not found, fall back to global `policy.json`

**Example `.aifirewall.json` for a fintech project:**

```json
{
  "extends": "global",
  "rules": {
    "block_db_urls": true,
    "allow_source_code": false
  },
  "file_scope": {
    "mode": "allowlist",
    "allowlist": [
      "src/components/**",
      "src/utils/**",
      "src/hooks/**"
    ]
  },
  "blocked_paths": [
    "/src/payments/",
    "/src/auth/secrets/"
  ]
}
```

This allows teams to define stricter file scope for sensitive repos (e.g., only UI code is visible to AI) and relaxed rules for public/open-source repos.

---

#### F15: ML-Assisted Secondary Scanner

**Purpose:** Reduce false positives and catch secrets that don't match regex patterns.

**Approach:**
- Lightweight distilled transformer classifier running as optional sidecar service
- Entropy-based detection: flag high-entropy strings that may be secrets even without pattern match
- Context-aware scoring: `password = "test123"` in a test file scores lower than the same in a production config

**Pipeline:** Regex scanner → ML classifier → contextual heuristic → final decision

---

### Phase 3 — Enterprise (Days 91–180)

---

#### F16: Organization Dashboard

- Multi-user support: invite team members with email
- Aggregated risk posture across all developers in the org
- Per-developer activity view (anonymizable for privacy)
- Policy push: admins define policies (including file scope templates) that auto-distribute to all local agents
- Trend analytics: risk over time, most common secret types, top offenders
- File scope compliance: see which developers have overridden org-level file scope rules

---

#### F17: Role-Based Access Control (RBAC)

| Role | Permissions |
|---|---|
| **Admin** | Full control — policy management, user management, audit access, billing, provider config |
| **Security Lead** | View all logs, manage policies, export reports; no billing access |
| **Developer** | View own logs, configure personal overrides within org policy limits |
| **Auditor** | Read-only access to logs, reports, and compliance exports |

---

#### F18: Compliance & Audit Exports

- Export logs as CSV, JSON, or formatted PDF reports
- SOC 2 evidence generation templates
- GDPR data handling proof documentation
- HIPAA audit trail exports
- Configurable retention periods (30 / 60 / 90 / 365 days)
- Automated scheduled report generation
- File scope audit: which files were accessible to AI per time period

---

#### F19: Air-Gapped Deployment

- Single binary or Docker image with all dependencies bundled
- No internet connectivity required for any functionality
- Local LLM pre-bundled or side-loadable via USB / internal artifact repo
- Updates delivered via signed packages through internal distribution

---

#### F20: CI/CD Integration

- **Pre-commit hook:** Scan staged code for secrets before allowing commit
- **GitHub Action / GitLab CI step:** Scan pull requests for AI-leakable content
- **CLI tool:** `aifirewall scan ./src --report` for on-demand scanning (respects file scope)
- **Webhook integration:** Post scan results to Slack, Teams, or custom endpoints

---

#### F21: AI Permission Prompt (Interactive Mode)

Before sending any flagged request, prompt the developer interactively:

```
┌─────────────────────────────────────────────┐
│  AI Firewall — Sensitive Data Detected      │
│                                             │
│  File: src/payments/stripe.ts               │
│  Scope: BLOCKED by policy (file_scope)      │
│  Secrets: 1 API key, 1 DB URL              │
│  Risk Score: 78 / 100                       │
│                                             │
│  [Allow Once] [Redact & Send] [Block]       │
│  [ ] Remember for this file                 │
└─────────────────────────────────────────────┘
```

Configurable via `"interactive_mode": true` in policy.json. Defaults to off (auto-apply policy).

---

### Phase 4 — AI Gateway Platform (Days 181–240)

**This phase transforms AI Firewall from a security tool into a full AI Gateway Platform.** Users can bring their own API keys, subscribe to multiple AI providers, choose which model handles each request, and the platform enforces credit limits, tracks usage, and prevents overspend. The security layer (Phases 1–3) remains the foundation underneath.

---

#### F22: Provider Manager

**Purpose:** Store and manage multiple AI provider configurations. Users add their own API keys and subscriptions — the platform never provides or resells AI access.

**Supported providers (initial):**

| Provider | Base URL | Models |
|---|---|---|
| OpenAI | `https://api.openai.com/v1` | gpt-4, gpt-4-turbo, gpt-3.5-turbo |
| Anthropic | `https://api.anthropic.com/v1` | claude-3-opus, claude-3-sonnet, claude-3-haiku |
| Google (Gemini) | `https://generativelanguage.googleapis.com/v1` | gemini-pro, gemini-ultra |
| Local LLM (Ollama) | `http://localhost:11434` | llama3, mistral, deepseek-coder, codellama |
| Custom / Self-hosted | User-defined | User-defined |

**Interface:**

```typescript
type Provider = {
  id: number;
  name: string;
  slug: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
};

function addProvider(config: ProviderInput): Provider;
function listProviders(): Provider[];
function updateProvider(id: number, updates: Partial<ProviderInput>): Provider;
function deleteProvider(id: number): void;
function getProviderForModel(modelName: string): Provider;
```

---

#### F23: API Key Vault (Encrypted Storage)

**Purpose:** Securely store user-provided API keys. Keys are encrypted at rest and decrypted only in-memory at request time.

**Security requirements:**

- Keys are AES-256-GCM encrypted before writing to SQLite
- Encryption key derived from a master key stored in `.env` (auto-generated on first run)
- Keys are decrypted only in-memory, only for the duration of a single request
- Keys are never logged, never included in responses, never written to disk in plaintext
- Key rotation: users can update keys; old encrypted values are overwritten

**Interface:**

```typescript
function encryptKey(plaintext: string, masterKey: string): string;
function decryptKey(ciphertext: string, masterKey: string): string;
```

**Master key management:**

| Environment | Storage |
|---|---|
| Development | `.env` file (MASTER_KEY) |
| Production (local) | OS keychain (macOS Keychain, Windows DPAPI, Linux libsecret) |
| Enterprise | HSM or external vault (HashiCorp Vault, AWS KMS) |

---

#### F24: Model Manager

**Purpose:** Registry of available models across all configured providers, with cost metadata for credit calculation.

**Interface:**

```typescript
type Model = {
  id: number;
  providerId: number;
  modelName: string;
  displayName: string;
  inputCostPer1kTokens: number;
  outputCostPer1kTokens: number;
  maxContextTokens: number;
  enabled: boolean;
};

function listModels(): Model[];
function getModelsByProvider(providerId: number): Model[];
function setModelEnabled(modelId: number, enabled: boolean): void;
```

**Default model registry (auto-populated when provider is added):**

| Provider | Model | Input Cost/1K tokens | Output Cost/1K tokens |
|---|---|---|---|
| OpenAI | gpt-4-turbo | $0.01 | $0.03 |
| OpenAI | gpt-3.5-turbo | $0.0005 | $0.0015 |
| Anthropic | claude-3-sonnet | $0.003 | $0.015 |
| Anthropic | claude-3-haiku | $0.00025 | $0.00125 |
| Google | gemini-pro | $0.00025 | $0.0005 |
| Local | llama3 | $0 | $0 |

Costs are user-editable to match their actual pricing tier.

---

#### F25: Credit Manager

**Purpose:** Enforce usage limits per provider, per model, or globally. Prevents overuse and controls AI spend.

**Credit strategies (user chooses one or combines):**

| Strategy | How It Works | Best For |
|---|---|---|
| **Request count** | N requests per period | Simple teams, flat budgets |
| **Token count** | N tokens (input + output) per period | Cost-conscious orgs |
| **Dollar budget** | $X spend per period (calculated from token cost) | Finance-driven enterprises |

**Interface:**

```typescript
type CreditConfig = {
  id: number;
  providerId: number | null;
  modelId: number | null;
  limitType: "requests" | "tokens" | "dollars";
  totalLimit: number;
  usedAmount: number;
  resetPeriod: "daily" | "weekly" | "monthly";
  resetDate: number;
  hardLimit: boolean;
};

type CreditCheck = {
  allowed: boolean;
  remaining: number;
  limitType: string;
  message?: string;
};

function checkCredit(providerId: number, modelId?: number): CreditCheck;
function recordUsage(providerId: number, modelId: number, usage: UsageRecord): void;
function getCreditStatus(providerId?: number): CreditConfig[];
function resetCredits(creditId: number): void;
```

**Enforcement behavior:**

```
Before forwarding request:
  IF hardLimit AND usedAmount >= totalLimit:
    → BLOCK request
    → Return: "Credit limit exhausted. Resets on {resetDate}."

  IF softLimit AND usedAmount >= totalLimit:
    → WARN user but allow request
    → Log warning

After receiving response:
  → Calculate tokens used (from provider response headers or token counter)
  → usedAmount += tokensUsed (or requestCount++ or dollarCost)
  → Persist to SQLite
```

**Dashboard integration:** Credit status is prominently displayed on the dashboard with progress bars, projected exhaustion dates, and alert thresholds (e.g., warn at 80%).

---

#### F26: Multi-Model Router

**Purpose:** Route each request to the correct provider and model based on the `model` field in the request body, user preferences, or automatic selection.

**Routing priority:**

```
1. Explicit model in request body (e.g., "model": "gpt-4")
   → Look up provider for this model
   → Check if provider is enabled
   → Check credit

2. Smart routing override (if enabled, from Phase 2)
   → risk_score >= 70 → local LLM
   → risk_score >= 30 → cheapest enabled cloud model with redaction
   → default → user's preferred model

3. Default model (user-configured fallback)
```

**Key behavior:** The user does NOT send their API key in the request. The proxy injects the correct decrypted key from the vault before forwarding.

**Interface:**

```typescript
type RouteDecision = {
  provider: Provider;
  model: Model;
  apiKey: string;
  baseUrl: string;
  creditCheck: CreditCheck;
};

function routeRequest(
  requestedModel: string,
  riskScore: number,
  options?: { preferLocal?: boolean; preferCheapest?: boolean }
): RouteDecision;
```

---

#### F27: Usage Tracking & Analytics

**Purpose:** Track every AI request with token counts, cost, and model used. Provide analytics for cost optimization.

**Interface:**

```typescript
type UsageRecord = {
  providerId: number;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
  requestId: string;
};

function getUsageSummary(options: {
  providerId?: number;
  period: "day" | "week" | "month";
}): UsageSummary;
```

**Dashboard views (additions to F9):**

| View | Content |
|---|---|
| **Usage Overview** | Total tokens, total cost, requests by model, trend chart |
| **Cost Breakdown** | Per-provider and per-model cost pie charts |
| **Credit Status** | Progress bars for each credit limit, projected exhaustion |
| **Model Comparison** | Side-by-side: cost per request, avg response time, usage count per model |
| **Alerts** | Configurable alerts: "80% credit used", "unusual spike in usage" |

---

#### F28: Subscription & Plan Management

**Purpose:** Users manage their own AI provider subscriptions through the gateway. The platform does not resell AI access — it provides the control layer on top of user-owned subscriptions.

**How it works:**

1. User subscribes directly to OpenAI, Anthropic, Google, etc. (their own account)
2. User enters their API key into AI Firewall's provider manager
3. User configures credit limits to match their subscription budget
4. AI Firewall enforces those limits, tracks usage, and provides cost visibility

**Plan templates (pre-configured credit limits):**

```json
{
  "plans": {
    "free_tier": {
      "description": "Light usage — good for trying out",
      "limits": [
        { "provider": "*", "type": "requests", "limit": 100, "period": "monthly" }
      ]
    },
    "pro_developer": {
      "description": "Active developer — moderate usage",
      "limits": [
        { "provider": "openai", "type": "tokens", "limit": 500000, "period": "monthly" },
        { "provider": "anthropic", "type": "tokens", "limit": 300000, "period": "monthly" }
      ]
    },
    "team_standard": {
      "description": "Team plan — per-member limits",
      "limits": [
        { "provider": "*", "type": "dollars", "limit": 50, "period": "monthly" }
      ]
    },
    "enterprise_unlimited": {
      "description": "Audit and track only — no hard limits",
      "limits": [
        { "provider": "*", "type": "dollars", "limit": 10000, "period": "monthly", "hard": false }
      ]
    }
  }
}
```

Users select a plan template or create custom limits. Plans are stored locally and can be distributed via org policies in enterprise setups.

---

#### F29: Gateway Request Flow (Updated End-to-End)

**The complete request flow when all phases are active:**

```
[Developer sends prompt via VS Code / Browser / CLI]
            │
            ▼
[Extension checks file scope — strips out-of-scope file content]
            │
            ▼
[Request arrives at AI Firewall Proxy (localhost:8080)]
            │
            ▼
[1. File Scope Validation]
   Is referenced file/path allowed by policy?
   NO  → BLOCK with "File out of scope" error
   YES → continue
            │
            ▼
[2. Secret Scanner]
   Regex patterns → detect secrets
            │
            ▼
[3. PII Scanner]
   Regex patterns → detect PII
            │
            ▼
[4. Policy Engine]
   Evaluate scan results against rules
   → BLOCK | REDACT | ALLOW
   BLOCK → return HTTP 403, log, done
            │
            ▼
[5. Redactor (if REDACT)]
   Replace secrets with tokens
            │
            ▼
[6. Model Router]
   Determine target provider + model
   (explicit model, smart routing, or default)
            │
            ▼
[7. Credit Check]
   Does user have remaining credit for this provider/model?
   NO  → return HTTP 429 "Credit limit exhausted", log, done
   YES → continue
            │
            ▼
[8. API Key Injection]
   Decrypt provider API key from vault
   Inject into request headers
            │
            ▼
[9. Forward Request]
   Send to provider API (or local LLM)
            │
            ▼
[10. Receive Response]
   Extract token counts from response
            │
            ▼
[11. Usage Tracking]
   Record tokens used, calculate cost
   Update credit counter
            │
            ▼
[12. Logger]
   Write sanitized log entry to SQLite
            │
            ▼
[13. Return Response to Client]
   Include _firewall metadata (action, risk_score, tokens_used, cost)
```

---

## 6. System Architecture

### 6.1 MVP Architecture (Phase 1)

```
VS Code / Browser / CLI
         │
     [File Scope Check]
         │
         ▼
  ┌──────────────────────────────┐
  │  AI Firewall Proxy           │
  │  (localhost:8080)            │
  │                              │
  │  ┌────────────────────────┐  │
  │  │ Request Interceptor    │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ File Scope Validator   │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ Scanner Pipeline       │  │
  │  │  ├── Secret Scanner    │  │
  │  │  └── PII Scanner       │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ Policy Engine          │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ Redactor               │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ Logger (SQLite)        │  │
  │  └──────────┬─────────────┘  │
  │             ▼                │
  │  ┌────────────────────────┐  │
  │  │ Request Forwarder      │  │
  │  └──────────┬─────────────┘  │
  └─────────────┼────────────────┘
                ▼
       AI Provider API
  (OpenAI / Anthropic / Google)
```

### 6.2 Full Architecture (Phase 4 — AI Gateway)

```
Developer Machine                            Organization Layer
┌──────────────────────────┐                ┌───────────────────────────────┐
│  VS Code Extension       │                │  Org Dashboard                │
│  Browser Extension       │                │  Policy + File Scope Dist.    │
│  CLI Tool                │                │  Aggregated Analytics         │
│  Pre-commit Hook         │                │  RBAC                         │
└────────────┬─────────────┘                │  Compliance Reports           │
             ▼                              │  Credit Budgets per Team      │
┌──────────────────────────┐                └──────────────┬────────────────┘
│  AI Firewall Gateway     │◄──── policy sync ─────────────┘
│  (localhost:8080)        │
│                          │
│  File Scope Validator    │
│                          │
│  Scanner Pipeline:       │
│   Regex → ML → Context   │
│                          │──► SQLite (logs + usage)
│  Policy Engine           │──► Secure Vault (API keys + tokens)
│                          │
│  ┌────────────────────┐  │
│  │ AI Gateway Layer   │  │
│  │                    │  │
│  │ Provider Manager   │  │
│  │ Model Manager      │  │
│  │ API Key Vault      │  │
│  │ Credit Manager     │  │
│  │ Usage Tracker      │  │
│  │ Multi-Model Router │  │
│  └────────┬───────────┘  │
│           │              │
│           ├──► OpenAI    │
│           ├──► Anthropic │
│           ├──► Google    │
│           ├──► Local LLM │
│           └──► Custom    │
└──────────────────────────┘
```

### 6.3 Request Flow Diagram (Phase 1 — MVP)

```
[Developer types prompt in VS Code]
            │
            ▼
[VS Code Extension: check file scope, strip out-of-scope content]
            │
            ▼
[Redirects to localhost:8080]
            │
            ▼
[Proxy receives request]
            │
            ▼
[Validate file scope at proxy level]
            │
            ▼
[Secret Scanner → PII Scanner]
            │
            ▼
[Policy Engine: evaluate]
            │
            ├──► BLOCK → HTTP 403 + log
            ├──► REDACT → replace → forward → log
            └──► ALLOW → forward → log
                    │
                    ▼
          [AI Provider response → client]
```

### 6.4 Request Flow Diagram (Phase 4 — Full Gateway)

```
[Developer sends prompt]
            │
            ▼
[Extension: file scope enforcement]
            │
            ▼
[Proxy: file scope + secret scan + PII scan]
            │
            ▼
[Policy Engine: BLOCK / REDACT / ALLOW]
            │ (if not blocked)
            ▼
[Redactor: clean prompt]
            │
            ▼
[Model Router: select provider + model]
            │
            ▼
[Credit Manager: check limits]
            │ (if credit available)
            ▼
[Key Vault: decrypt API key]
            │
            ▼
[Forward to provider with injected key]
            │
            ▼
[Receive response → track usage → update credits → log → return]
```

---

## 7. Technology Stack

### 7.1 Stack Overview

| Layer | Technology | Rationale |
|---|---|---|
| **Proxy server** | Node.js 20+ / TypeScript / Fastify | Fast, lightweight, large ecosystem |
| **Secret scanning** | Custom regex engine + gitleaks patterns | No external dependency for MVP |
| **PII scanning** | Regex (MVP) → Microsoft Presidio (Phase 2) | Presidio is best-in-class for PII |
| **Policy engine** | JSON config + TypeScript evaluator | Simple, portable, version-controllable |
| **File scope** | Glob matching (micromatch or picomatch) | Fast, standard glob pattern syntax |
| **Database** | SQLite via better-sqlite3 | Zero setup, local-only, fast |
| **Encryption** | Node.js crypto (AES-256-GCM) | Built-in, no extra dependency |
| **Dashboard** | React + Vite + Tailwind CSS | Modern, fast build, great DX |
| **VS Code extension** | TypeScript + VS Code Extension API | Native integration |
| **Browser extension** | TypeScript + Chrome Extension Manifest V3 | Cross-browser support |
| **Local LLM runtime** | Ollama / llama.cpp | Industry standard for local inference |
| **Local agent (future)** | Rust | Performance + memory safety for background service |
| **CLI tool** | TypeScript compiled with pkg or Bun | Single portable binary |

### 7.2 MVP Dependencies

```json
{
  "dependencies": {
    "fastify": "^4.x",
    "axios": "^1.x",
    "better-sqlite3": "^9.x",
    "dotenv": "^16.x",
    "zod": "^3.x",
    "picomatch": "^3.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "ts-node": "^10.x",
    "nodemon": "^3.x",
    "eslint": "^8.x",
    "vitest": "^1.x",
    "@types/better-sqlite3": "^7.x"
  }
}
```

---

## 8. Project Structure

```
ai-firewall/
│
├── proxy/                              # Core proxy server (all phases)
│   ├── src/
│   │   ├── server.ts                   # Fastify server entry point
│   │   ├── config.ts                   # Env + policy config loader
│   │   │
│   │   ├── routes/
│   │   │   ├── ai.route.ts            # POST /v1/chat/completions
│   │   │   ├── logs.route.ts          # GET /api/logs (dashboard API)
│   │   │   ├── providers.route.ts     # CRUD /api/providers (Phase 4)
│   │   │   ├── credits.route.ts       # CRUD /api/credits (Phase 4)
│   │   │   ├── usage.route.ts         # GET /api/usage (Phase 4)
│   │   │   ├── models.route.ts        # GET /api/models (Phase 4)
│   │   │   └── health.route.ts        # GET /health
│   │   │
│   │   ├── scanner/
│   │   │   ├── secretScanner.ts       # Regex-based secret detection
│   │   │   ├── piiScanner.ts          # Regex-based PII detection
│   │   │   └── patterns.ts           # All regex patterns centralized
│   │   │
│   │   ├── scope/
│   │   │   └── fileScope.ts          # File scope validation (glob matching)
│   │   │
│   │   ├── policy/
│   │   │   └── policyEngine.ts        # Rule evaluation + file scope logic
│   │   │
│   │   ├── redactor/
│   │   │   └── redactor.ts            # Text replacement logic
│   │   │
│   │   ├── router/
│   │   │   ├── aiRouter.ts           # Smart model routing (Phase 2)
│   │   │   └── modelRouter.ts        # Multi-provider routing (Phase 4)
│   │   │
│   │   ├── providers/                 # Phase 4: Provider management
│   │   │   ├── providerService.ts
│   │   │   └── providerRepository.ts
│   │   │
│   │   ├── credits/                   # Phase 4: Credit management
│   │   │   ├── creditService.ts
│   │   │   └── creditRepository.ts
│   │   │
│   │   ├── usage/                     # Phase 4: Usage tracking
│   │   │   ├── usageService.ts
│   │   │   └── usageRepository.ts
│   │   │
│   │   ├── vault/                     # Phase 4: Encrypted key storage
│   │   │   └── encryption.ts
│   │   │
│   │   ├── logger/
│   │   │   └── logger.ts             # SQLite write operations
│   │   │
│   │   ├── db/
│   │   │   ├── database.ts           # SQLite init + migrations
│   │   │   └── migrations/           # Schema migrations per phase
│   │   │       ├── 001_core.sql
│   │   │       ├── 002_file_scope.sql
│   │   │       └── 003_gateway.sql
│   │   │
│   │   └── types/
│   │       └── index.ts              # Shared TypeScript types
│   │
│   ├── policy.json                    # Default policy + file scope config
│   ├── plans.json                     # Credit plan templates (Phase 4)
│   ├── package.json
│   └── tsconfig.json
│
├── dashboard/                          # Web-based monitoring UI
│   ├── src/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── pages/
│   │   │   ├── Overview.tsx
│   │   │   ├── Logs.tsx
│   │   │   ├── RiskScore.tsx
│   │   │   ├── FileScope.tsx          # File scope tree view
│   │   │   ├── Settings.tsx
│   │   │   ├── Providers.tsx          # Phase 4: Provider management UI
│   │   │   ├── Credits.tsx            # Phase 4: Credit status + config
│   │   │   └── Usage.tsx              # Phase 4: Usage analytics
│   │   └── components/
│   │       ├── RequestTable.tsx
│   │       ├── RiskBadge.tsx
│   │       ├── PolicyToggle.tsx
│   │       ├── FileScopeTree.tsx
│   │       ├── CreditProgressBar.tsx  # Phase 4
│   │       ├── ProviderCard.tsx       # Phase 4
│   │       └── Chart.tsx
│   ├── package.json
│   └── vite.config.ts
│
├── vscode-extension/                   # VS Code integration
│   ├── src/
│   │   ├── extension.ts              # Extension entry point
│   │   ├── statusBar.ts             # Status bar indicator
│   │   ├── fileScope.ts             # File scope enforcement in editor
│   │   └── commands.ts              # Command palette commands
│   └── package.json
│
├── browser-extension/                  # Chrome/Firefox extension
│   ├── manifest.json
│   ├── background.ts                 # Service worker
│   ├── popup.tsx                     # Extension popup UI
│   └── content.ts                    # Page injection script
│
├── cli/                               # Command-line scanner tool
│   ├── src/
│   │   └── index.ts                  # aifirewall scan / status / credits
│   └── package.json
│
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## 9. Development Plan & Timeline

### Phase 1 — MVP (30 days, solo developer)

| Week | Deliverables | Est. Days |
|---|---|---|
| **Week 1** | Proxy server (Fastify) + secret scanner + request forwarding to OpenAI | 5 |
| **Week 2** | PII scanner + redaction engine + policy engine with file scope + SQLite logging | 5 |
| **Week 3** | Dashboard UI (React + Tailwind) + risk score display + log viewer + file scope tree | 5 |
| **Week 4** | VS Code extension (with file scope enforcement) + browser extension + end-to-end testing | 5 |

**Phase 1 exit criteria:**
- Proxy runs on localhost:8080 and accepts OpenAI-compatible requests
- File scope enforced: out-of-scope files stripped before scanning
- All 10+ secret patterns detected with >95% accuracy on test data
- Redaction replaces secrets with typed tokens correctly
- Dashboard renders logs and file scope tree with <1s load time
- VS Code extension installs, redirects traffic, and enforces file scope
- Zero raw secrets found in SQLite after 1000 test requests

### Phase 2 — Differentiation (60 days, 1–2 developers)

| Weeks | Deliverables |
|---|---|
| **Week 5–6** | Smart AI Router + Ollama local LLM integration |
| **Week 7–8** | AI Leak Simulator (respects file scope; reports in-scope and out-of-scope risk separately) |
| **Week 9–10** | Per-project policies (including per-project file scope) + reversible tokenization |
| **Week 11–12** | ML-assisted secondary scanner (entropy + lightweight classifier) |

### Phase 3 — Enterprise (90 days, 2–3 person team)

| Month | Deliverables |
|---|---|
| **Month 4** | Organization dashboard + RBAC + policy/file-scope distribution |
| **Month 5** | Compliance exports + audit trail + CI/CD hooks + CLI tool |
| **Month 6** | Air-gapped deployment + installer + enterprise hardening + documentation |

### Phase 4 — AI Gateway Platform (60 days, 2–3 person team)

| Weeks | Deliverables | Est. Days |
|---|---|---|
| **Week 1–2** | Provider manager + API key vault (encryption) + provider CRUD API + UI | 10 |
| **Week 2–3** | Model manager + model registry + auto-populate from provider | 5 |
| **Week 3–4** | Credit manager + limit enforcement + plan templates | 10 |
| **Week 4–5** | Multi-model router (merges with smart router) + key injection | 10 |
| **Week 5–7** | Usage tracking + analytics dashboard + cost breakdown views | 10 |
| **Week 7–8** | Subscription management UI + plan templates + alerts + end-to-end testing | 10 |

**Phase 4 exit criteria:**
- User can add 3+ providers with encrypted API keys
- Requests route to correct provider based on model name
- Credit limits enforced: requests blocked when limit exhausted
- Usage tracked per request with token counts and cost
- Dashboard shows credit status, usage trends, cost breakdown
- API keys never appear in logs, responses, or error messages

### Total Timeline

| Phase | Duration | Cumulative |
|---|---|---|
| Phase 1 — MVP | 30 days | Day 30 |
| Phase 2 — Differentiation | 60 days | Day 90 |
| Phase 3 — Enterprise | 90 days | Day 180 |
| Phase 4 — AI Gateway | 60 days | Day 240 |

### Team Requirements

| Phase | Team |
|---|---|
| Phase 1 (MVP) | 1 full-stack engineer |
| Phase 2 | 1 backend engineer + 1 frontend engineer |
| Phase 3 | 1 backend + 1 frontend + 1 security engineer |
| Phase 4 | 1 backend + 1 frontend + 1 security engineer (same team, extended) |

---

## 10. Environment & Configuration

### 10.1 Environment Variables

```env
# Server
PORT=8080
DASHBOARD_PORT=3000

# AI Provider (Phase 1 — single provider; Phase 4 replaces with vault)
OPENAI_API_KEY=your_key_here
PROVIDER_URL=https://api.openai.com/v1/chat/completions

# Local LLM (Phase 2)
LOCAL_LLM_URL=http://localhost:11434
LOCAL_LLM_MODEL=llama3

# Logging
LOG_RETENTION_DAYS=90
LOG_LEVEL=info

# Security
ENCRYPTION_KEY=auto_generated_on_first_run

# Phase 4: Master key for API key encryption
MASTER_KEY=auto_generated_on_first_run
```

### 10.2 Policy Configuration (with File Scope)

```json
{
  "version": "1.0",
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
    "blocklist": [
      ".env",
      ".env.*",
      "**/*.pem",
      "**/*.key",
      "**/secrets/**",
      "**/credentials/**",
      "**/config/production.*",
      "**/.git/**",
      "**/node_modules/**",
      "**/dist/**",
      "**/.aifirewall-vault/**"
    ],
    "allowlist": [],
    "max_file_size_kb": 500,
    "scan_on_open": false,
    "scan_on_send": true
  },
  "blocked_paths": [
    "/payments/",
    "/auth/",
    "/internal/",
    "/.env"
  ],
  "severity_threshold": "medium"
}
```

### 10.3 Per-Project Override

Place `.aifirewall.json` in project root:

```json
{
  "extends": "global",
  "rules": {
    "block_db_urls": true,
    "allow_source_code": false
  },
  "file_scope": {
    "mode": "allowlist",
    "allowlist": [
      "src/components/**",
      "src/utils/**",
      "src/hooks/**",
      "src/pages/**"
    ]
  },
  "blocked_paths": [
    "/src/payments/",
    "/src/auth/secrets/"
  ]
}
```

---

## 11. API Specification

### 11.1 Proxy Endpoint

**`POST /v1/chat/completions`**

OpenAI-compatible. Accepts the same request format as `https://api.openai.com/v1/chat/completions`.

**Request (Phase 1 — user sends API key):**

```http
POST /v1/chat/completions HTTP/1.1
Host: localhost:8080
Content-Type: application/json
Authorization: Bearer OPENAI_API_KEY

{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Fix this code. My key is AKIAIOSFODNN7EXAMPLE"
    }
  ]
}
```

**Request (Phase 4 — key injected from vault, user sends no key):**

```http
POST /v1/chat/completions HTTP/1.1
Host: localhost:8080
Content-Type: application/json

{
  "model": "gpt-4",
  "messages": [
    {
      "role": "user",
      "content": "Fix this code."
    }
  ]
}
```

The proxy looks up `gpt-4` → finds OpenAI provider → decrypts stored key → injects into outbound request.

**Response (success — redacted):**

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "Here is the fixed code..."
      }
    }
  ],
  "_firewall": {
    "action": "REDACT",
    "secrets_found": 1,
    "files_blocked": 0,
    "risk_score": 65,
    "provider": "openai",
    "model": "gpt-4",
    "tokens_used": 450,
    "cost": 0.0135,
    "credit_remaining": 87500
  }
}
```

**Response (blocked — secret detected):**

```http
HTTP/1.1 403 Forbidden

{
  "error": "Request blocked due to sensitive data",
  "code": "FIREWALL_BLOCKED",
  "reasons": ["Private key detected"],
  "risk_score": 95
}
```

**Response (blocked — file out of scope):**

```http
HTTP/1.1 403 Forbidden

{
  "error": "Request blocked by file scope policy",
  "code": "FILE_SCOPE_BLOCKED",
  "reasons": ["File src/auth/secrets/jwt.key is excluded by scope policy"],
  "files_blocked": ["src/auth/secrets/jwt.key"]
}
```

**Response (blocked — credit exhausted):**

```http
HTTP/1.1 429 Too Many Requests

{
  "error": "Credit limit exhausted",
  "code": "CREDIT_EXHAUSTED",
  "provider": "openai",
  "limit_type": "tokens",
  "total_limit": 500000,
  "used": 500000,
  "resets_at": "2026-03-01T00:00:00Z"
}
```

### 11.2 Dashboard API Endpoints (All Phases)

| Method | Endpoint | Phase | Description |
|---|---|---|---|
| `GET` | `/api/logs` | 1 | Paginated request logs |
| `GET` | `/api/logs/:id` | 1 | Single log entry detail |
| `GET` | `/api/stats` | 1 | Aggregated statistics |
| `GET` | `/api/risk-score` | 1 | Current project risk score |
| `GET` | `/api/policy` | 1 | Current policy configuration |
| `PUT` | `/api/policy` | 1 | Update policy configuration |
| `GET` | `/api/file-scope` | 1 | Current file scope rules + file tree with status |
| `PUT` | `/api/file-scope` | 1 | Update file scope configuration |
| `GET` | `/health` | 1 | Proxy health check |
| `POST` | `/api/providers` | 4 | Add a new AI provider with API key |
| `GET` | `/api/providers` | 4 | List all providers (keys masked) |
| `PUT` | `/api/providers/:id` | 4 | Update provider config or key |
| `DELETE` | `/api/providers/:id` | 4 | Remove provider and encrypted key |
| `GET` | `/api/models` | 4 | List all models across providers |
| `PUT` | `/api/models/:id` | 4 | Enable/disable model, update cost |
| `POST` | `/api/credits` | 4 | Add or update credit limits |
| `GET` | `/api/credits` | 4 | Get credit status for all providers |
| `GET` | `/api/credits/:providerId` | 4 | Get credit status for one provider |
| `POST` | `/api/credits/:id/reset` | 4 | Manually reset credit counter |
| `GET` | `/api/usage` | 4 | Usage summary (query: `?period=month&provider=openai`) |
| `GET` | `/api/usage/breakdown` | 4 | Per-model cost breakdown |
| `GET` | `/api/plans` | 4 | List available plan templates |
| `POST` | `/api/plans/apply` | 4 | Apply a plan template to credit config |

---

## 12. Database Schema (All Phases)

### 12.1 Phase 1 — Core Tables

```sql
-- Request logs
CREATE TABLE logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp       INTEGER NOT NULL,
  model           TEXT NOT NULL,
  provider        TEXT NOT NULL,
  original_hash   TEXT NOT NULL,
  sanitized_text  TEXT NOT NULL,
  secrets_found   INTEGER DEFAULT 0,
  pii_found       INTEGER DEFAULT 0,
  files_blocked   INTEGER DEFAULT 0,
  risk_score      INTEGER DEFAULT 0,
  action          TEXT NOT NULL,
  reasons         TEXT,
  response_time_ms INTEGER
);

CREATE INDEX idx_logs_timestamp ON logs(timestamp);
CREATE INDEX idx_logs_action ON logs(action);
CREATE INDEX idx_logs_provider ON logs(provider);
```

### 12.2 Phase 4 — Gateway Tables

```sql
-- AI providers
CREATE TABLE providers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL UNIQUE,
  base_url        TEXT NOT NULL,
  api_key_encrypted TEXT NOT NULL,
  enabled         BOOLEAN DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- Available models
CREATE TABLE models (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id     INTEGER NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_name      TEXT NOT NULL,
  display_name    TEXT,
  input_cost_per_1k  REAL DEFAULT 0,
  output_cost_per_1k REAL DEFAULT 0,
  max_context_tokens INTEGER,
  enabled         BOOLEAN DEFAULT 1,
  UNIQUE(provider_id, model_name)
);

CREATE INDEX idx_models_provider ON models(provider_id);

-- Credit limits
CREATE TABLE credits (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  provider_id     INTEGER REFERENCES providers(id) ON DELETE CASCADE,
  model_id        INTEGER REFERENCES models(id) ON DELETE CASCADE,
  limit_type      TEXT NOT NULL CHECK(limit_type IN ('requests', 'tokens', 'dollars')),
  total_limit     REAL NOT NULL,
  used_amount     REAL DEFAULT 0,
  reset_period    TEXT NOT NULL CHECK(reset_period IN ('daily', 'weekly', 'monthly')),
  reset_date      INTEGER NOT NULL,
  hard_limit      BOOLEAN DEFAULT 1,
  created_at      INTEGER NOT NULL
);

CREATE INDEX idx_credits_provider ON credits(provider_id);

-- Usage tracking
CREATE TABLE usage_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  log_id          INTEGER REFERENCES logs(id),
  provider_id     INTEGER NOT NULL REFERENCES providers(id),
  model_name      TEXT NOT NULL,
  input_tokens    INTEGER DEFAULT 0,
  output_tokens   INTEGER DEFAULT 0,
  total_tokens    INTEGER DEFAULT 0,
  cost            REAL DEFAULT 0,
  timestamp       INTEGER NOT NULL
);

CREATE INDEX idx_usage_provider ON usage_logs(provider_id);
CREATE INDEX idx_usage_timestamp ON usage_logs(timestamp);
CREATE INDEX idx_usage_model ON usage_logs(model_name);
```

### 12.3 Migration Strategy

Schemas are versioned in `proxy/src/db/migrations/`. On startup, the proxy checks the current schema version and runs any pending migrations sequentially. This ensures clean upgrades from Phase 1 → 4 without data loss.

---

## 13. Performance & Security Requirements

### 13.1 Performance Targets

| Metric | Target |
|---|---|
| Scan latency overhead | <50ms per request |
| File scope check | <5ms (glob matching) |
| Memory usage (proxy) | <200MB (Phase 1), <350MB (Phase 4 with all modules) |
| SQLite write latency | <5ms per log entry |
| Dashboard initial load | <1s |
| Concurrent request handling | 50+ simultaneous |
| Regex pattern evaluation | <10ms for all patterns combined |
| Maximum prompt size supported | 500KB |
| API key decryption | <2ms per request |
| Credit check | <1ms (in-memory cache with SQLite backing) |

### 13.2 Security Requirements

| Requirement | Implementation |
|---|---|
| No raw secrets stored | Store only sanitized text + SHA-256 hash of original |
| Local-only by default | All data stays on machine; zero telemetry; no phone-home |
| Encrypted API key vault | AES-256-GCM; keys decrypted only in-memory per-request |
| No external network calls from scanner | Scanner runs fully offline; only the forwarder contacts AI providers |
| Extension permissions | Minimal: only intercept AI provider URLs, no broad network access |
| HTTPS support (optional) | Self-signed cert for localhost proxy if required by org policy |
| Input validation | All incoming requests validated with Zod before processing |
| API keys never exposed | Never in logs, never in responses, never in error messages |
| File scope enforcement | Out-of-scope files stripped at extension level AND validated at proxy level (defense in depth) |
| Credit data integrity | Atomic credit updates; no double-counting on concurrent requests |

---

## 14. Testing Strategy

### 14.1 Test Levels

| Level | Tool | Scope |
|---|---|---|
| **Unit tests** | Vitest | Scanner patterns, policy logic, redactor, file scope, credit logic, encryption |
| **Integration tests** | Vitest + light-my-request | Full proxy request flow end-to-end |
| **Extension tests** | VS Code Extension Test Runner | Activation, command registration, file scope enforcement |
| **Manual QA** | curl + dashboard | Full flow validation with real prompts |
| **Security tests** | Custom test suite | Key exposure, raw secret leakage, credit bypass |

### 14.2 Critical Test Cases

| # | Test Case | Phase | Expected Result |
|---|---|---|---|
| 1 | AWS key in prompt | 1 | BLOCKED, HTTP 403 |
| 2 | JWT in prompt | 1 | REDACTED, forwarded |
| 3 | Clean prompt, no secrets | 1 | ALLOWED, forwarded, logged |
| 4 | Private key in prompt | 1 | BLOCKED, HTTP 403 |
| 5 | Mixed content (secret + safe) | 1 | Secret redacted, rest forwarded |
| 6 | Email in prompt | 1 | REDACTED if policy enabled |
| 7 | Empty prompt | 1 | ALLOWED, forwarded, logged |
| 8 | Very large prompt (100KB+) | 1 | Handled within <50ms target |
| 9 | File in blocklist referenced in prompt | 1 | BLOCKED with FILE_SCOPE_BLOCKED |
| 10 | File NOT in allowlist (allowlist mode) | 1 | BLOCKED with FILE_SCOPE_BLOCKED |
| 11 | `.env` file content in prompt | 1 | BLOCKED (always in default blocklist) |
| 12 | File over max_file_size_kb | 1 | BLOCKED or truncated per policy |
| 13 | Policy toggle off → secret in prompt | 1 | ALLOWED (policy respected) |
| 14 | Malformed request body | 1 | HTTP 400, no crash |
| 15 | AI provider timeout | 1 | Graceful error, logged |
| 16 | SQLite log check after 1000 requests | 1 | Zero raw secrets in any row |
| 17 | Add provider with API key | 4 | Key encrypted in DB, never plaintext |
| 18 | Request with `model: "gpt-4"` | 4 | Routes to OpenAI, key injected |
| 19 | Request with `model: "claude-3-sonnet"` | 4 | Routes to Anthropic, key injected |
| 20 | Request when credit exhausted (hard) | 4 | HTTP 429 CREDIT_EXHAUSTED |
| 21 | Request when credit exhausted (soft) | 4 | ALLOWED with warning logged |
| 22 | List providers → check keys masked | 4 | Keys shown as `sk-****xxxx` |
| 23 | Delete provider → check key removed | 4 | Encrypted key purged from DB |
| 24 | Usage tracking after request | 4 | Token count + cost recorded accurately |
| 25 | Credit reset (manual) | 4 | used_amount returns to 0 |
| 26 | Concurrent requests → credit race | 4 | No double-counting (atomic update) |

### 14.3 Test Data

Maintain `test/fixtures/`:
- `secrets.txt` — prompts containing each secret type
- `clean.txt` — prompts with no secrets
- `mixed.txt` — prompts with partial sensitive content
- `edge-cases.txt` — unicode, very long strings, nested patterns
- `file-scope/` — directory tree with in-scope and out-of-scope files for scope testing
- `providers.json` — mock provider configs for gateway testing

---

## 15. Monetization Strategy

### 15.1 Pricing Tiers

| Tier | Price | Features |
|---|---|---|
| **Free / Open Source** | $0 | Local proxy, basic scanning (5 patterns), file scope (blocklist only), SQLite logs, CLI |
| **Pro (Individual)** | $8–15/month | Full pattern library (25+), dashboard, browser extension, smart routing, allowlist mode |
| **Team** | $30–60/user/month | Shared policies, team dashboard, per-project profiles, priority support |
| **Enterprise** | Custom ($1K–10K/year) | RBAC, compliance exports, air-gapped deploy, SSO, SLA, dedicated support |
| **Gateway** | +$10–25/user/month (add-on) | Multi-provider BYOK, credit management, usage analytics, cost optimization, plan templates |

### 15.2 Business Model

**Open-core:** Core proxy + scanner + file scope is open source (builds community, trust, and adoption). Dashboard, smart routing, gateway features, and enterprise features are paid.

**Gateway model:** We never resell AI access. Users bring their own subscriptions. We charge for the **control plane** — the management, security, and visibility layer on top of their existing AI spend.

### 15.3 Revenue Projections (Conservative)

| Milestone | Timeline | Est. MRR |
|---|---|---|
| 100 free users, 10 Pro | Month 3 | $100–150 |
| 500 free, 50 Pro, 5 Team | Month 6 | $1,500–3,000 |
| 2000 free, 200 Pro, 20 Team, 2 Enterprise | Month 12 | $10,000–20,000 |
| 5000 free, 500 Pro+Gateway, 50 Team, 10 Enterprise | Month 18 | $30,000–60,000 |

---

## 16. Risks & Mitigations

| # | Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|---|
| 1 | **False positives** annoy developers, hurt adoption | High | High | Tunable sensitivity; "always allow for this file"; interactive mode; per-project profiles |
| 2 | **False negatives** miss real secrets | Critical | Medium | Layered scanning (regex → entropy → ML); community patterns; regular updates |
| 3 | **AI providers change API formats** | Medium | Medium | Abstract provider interface with version-pinned adapters; monitor changelogs |
| 4 | **Large prompts cause latency** spikes | Medium | Medium | Stream-based scanning; async pipeline; early termination on block |
| 5 | **Competitors add similar features** | High | High | Ship fast; build community; focus on leak simulator + gateway as moats |
| 6 | **Enterprise sales cycle is long** | Medium | High | Land with free/pro tier; bottom-up developer adoption |
| 7 | **Local LLM quality varies** by hardware | Medium | Medium | Curate recommended models; benchmark scores; fallback to cloud |
| 8 | **Regex maintenance burden** | Low | High | Centralized patterns; automated testing; community contributions |
| 9 | **VS Code extension conflicts** with AI tools | Medium | Medium | Minimal footprint; only override API base URL; test against top 10 extensions |
| 10 | **Data breach of local logs** | Critical | Low | Encrypt SQLite at rest; never store raw secrets; hash-only |
| 11 | **File scope too strict** kills developer productivity | High | Medium | Default to blocklist mode; clear dashboard UI for scope; easy per-file overrides |
| 12 | **Encrypted key vault compromise** | Critical | Low | AES-256-GCM; master key in OS keychain; keys decrypted only in-memory |
| 13 | **Credit tracking inaccuracy** | Medium | Medium | Atomic SQLite updates; reconciliation with provider billing API; manual reset option |
| 14 | **Provider pricing changes** break cost calculation | Low | High | User-editable cost table; periodic prompt to update; auto-sync option (Phase 4+) |
| 15 | **Token counting mismatch** (local vs provider) | Low | Medium | Use provider response headers when available; tiktoken as local fallback |

---

## 17. Success Metrics

### Phase 1 — MVP (Day 30)

| Metric | Target |
|---|---|
| Proxy handles requests without failure | 1000+ sequential, 0 crashes |
| Secret pattern accuracy | >95% detection rate on test fixtures |
| File scope enforcement | 100% of blocklisted files blocked in tests |
| Dashboard renders logs + file scope tree | <1s load time |
| VS Code extension functional | Installs, redirects, enforces scope, shows status |
| Raw secret leakage in storage | Zero instances in SQLite after 1000 requests |

### Phase 2 — Differentiation (Day 90)

| Metric | Target |
|---|---|
| Smart router classification accuracy | >90% correct routing decisions |
| Leak simulator report generation | Works for 3+ project structures; respects file scope |
| Beta user count | 100+ developers using free tier |
| Community pattern contributions | 5+ external pattern submissions |

### Phase 3 — Enterprise (Day 180)

| Metric | Target |
|---|---|
| Enterprise pilot customers | 3+ organizations |
| Compliance export validation | SOC 2 evidence accepted by auditor |
| Air-gapped deployment test | Fully functional in isolated environment |
| Uptime (proxy) | 99.9% on developer machines |

### Phase 4 — AI Gateway (Day 240)

| Metric | Target |
|---|---|
| Multi-provider support | 3+ providers configured and routing correctly |
| API key security | Zero key leakage in 10,000 request test (logs, responses, errors) |
| Credit enforcement accuracy | 100% of hard-limit requests blocked at threshold |
| Usage tracking accuracy | <2% variance from provider billing for token counts |
| Cost dashboard accuracy | Matches actual provider invoices within 5% |
| Gateway user adoption | 50+ users with multi-provider setups |

---

## 18. Additional Recommendations

These are features and strategies beyond the core roadmap that strengthen the product's competitive position:

### 18.1 Entropy-Based Detection

Catch secrets that don't match any known regex pattern by measuring string randomness. A high-entropy string (e.g., `a8f3kL9mNq2xP7vR`) longer than 20 characters adjacent to keywords like `key`, `secret`, `token` is very likely a credential. This dramatically reduces false negatives.

### 18.2 Context-Aware Scanning

Understand that `password = "test123"` in a test file is different from `password = "Pr0d$ecret!"` in a production config. Use file path context (test vs. src), variable naming conventions, and surrounding code to adjust severity scoring.

### 18.3 Prompt Fingerprinting & Deduplication

Hash and deduplicate repeated prompts to:
- Show developers when they are repeatedly sending the same sensitive content
- Reduce unnecessary scans for identical prompts
- Surface patterns in AI usage (e.g., "you send payment code 12x/day")

### 18.4 Community Pattern Registry

Allow users to contribute, share, and subscribe to detection pattern sets. Structure as a `patterns.d/` directory with loadable pattern files. This builds a defensible community moat similar to how Snyk and YARA rules work.

### 18.5 "What Would AI See?" Preview

Before any prompt is sent, offer a diff-like preview showing original vs. sanitized content side-by-side. Developers see exactly what will leave their machine — with out-of-scope files already stripped. This builds trust and reduces anxiety about AI tool usage.

### 18.6 Metrics Webhooks / SIEM Integration

Allow enterprises to pipe scan metrics AND usage/cost data to existing monitoring infrastructure (Splunk, Datadog, ELK, PagerDuty) via configurable webhooks or syslog output. This is often a hard requirement for enterprise procurement.

### 18.7 VS Code CodeLens Integration

Show inline annotations above functions or files that contain sensitive patterns or are out of scope:

```
🔒 AI Firewall: File blocked by scope policy — AI cannot access this file
function processPayment(stripeKey: string, amount: number) {
```

```
⚠ AI Firewall: 3 secrets detected — will be redacted before AI access
function connectDatabase(url: string) {
```

### 18.8 Scheduled Codebase Scans

Run a background scan of the full workspace on a configurable schedule (e.g., every 6 hours) and update the dashboard risk score. This provides continuous posture monitoring even when no AI requests are being made. Scans respect file scope — only scan in-scope files.

### 18.9 Exportable Scanner Package

Design the scanner, file scope engine, and policy engine as a standalone, importable npm package (`@aifirewall/scanner`) so other tools — CI systems, other IDEs, custom applications — can embed scanning without running the full proxy server.

### 18.10 Onboarding & Policy Templates

Ship pre-built policy templates (including file scope configs) for common stacks:

| Template | File Scope | Blocked Patterns | Use Case |
|---|---|---|---|
| `node-web` | Block: `.env`, `config/prod.*`, `node_modules/` | DB URLs, JWT, npm tokens | Node.js web apps |
| `python-ml` | Block: `.env`, `*.ipynb` outputs, `models/` | API keys, model weights | Python ML projects |
| `infrastructure` | Allowlist: `docs/`, `scripts/` only | Cloud creds, SSH keys, Terraform state | DevOps / IaC repos |
| `fintech` | Allowlist: `src/components/`, `src/utils/` only | All PII, payment keys, endpoints | Financial services |
| `healthcare` | Allowlist: UI + utils only | All PII, HIPAA identifiers, medical records | Healthcare orgs |

### 18.11 Provider Cost Auto-Sync

For Phase 4+: periodically fetch current pricing from provider APIs (where available) or community-maintained pricing databases to keep cost calculations accurate without manual updates.

### 18.12 Budget Alerts & Notifications

Configurable alert thresholds for credit limits:
- 50% used → info notification on dashboard
- 80% used → warning notification + VS Code status bar turns orange
- 95% used → urgent alert + email/webhook notification
- 100% → request blocked (hard limit) or logged warning (soft limit)

---

## Appendix A: Glossary

| Term | Definition |
|---|---|
| **AI Firewall** | The complete product: proxy + scanner + policy engine + extensions |
| **AI Gateway** | Phase 4 extension: multi-provider, BYOK, credit control, usage tracking |
| **Proxy** | The Fastify server that intercepts and forwards AI requests |
| **Scanner** | The detection pipeline (secret scanner + PII scanner) |
| **File Scope** | Rules controlling which files/directories AI is allowed to access |
| **Policy Engine** | Rule evaluator that decides ALLOW / BLOCK / REDACT |
| **Redactor** | Component that replaces sensitive content with tokens |
| **Smart Router** | Logic that directs prompts to local or cloud AI based on risk |
| **Model Router** | Phase 4 logic that directs prompts to the correct provider based on model name |
| **Leak Simulator** | Tool that analyzes what AI could infer from a codebase |
| **Risk Score** | 0–100 numeric score representing sensitivity of a prompt or project |
| **BYOK** | Bring Your Own Key — users provide their own AI provider API keys |
| **Credit Manager** | Enforces usage limits (requests, tokens, or dollars) per provider/model |
| **API Key Vault** | Encrypted local storage for user-provided AI provider API keys |
| **Provider Manager** | Registry of configured AI providers with their endpoints and keys |

## Appendix B: Startup Commands

```bash
# Install dependencies
cd ai-firewall/proxy && npm install

# Start proxy in development mode
npm run dev
# → AI Firewall running on http://localhost:8080

# Start dashboard
cd ai-firewall/dashboard && npm install && npm run dev
# → Dashboard running on http://localhost:3000

# Test with curl (Phase 1 — key in request)
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "My key is AKIAIOSFODNN7EXAMPLE"}]
  }'
# → Expected: redacted or blocked response

# Test with curl (Phase 4 — key from vault, no auth header needed)
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Explain quicksort"}]
  }'
# → Expected: routed to OpenAI, key injected, usage tracked

# Add a provider (Phase 4)
curl -X POST http://localhost:8080/api/providers \
  -H "Content-Type: application/json" \
  -d '{
    "name": "OpenAI",
    "slug": "openai",
    "baseUrl": "https://api.openai.com/v1",
    "apiKey": "sk-your-key-here"
  }'

# Check credit status (Phase 4)
curl http://localhost:8080/api/credits
```

## Appendix C: Definition of Done

### Phase 1 is complete when:

- [ ] Proxy server runs on localhost:8080 and accepts OpenAI-compatible requests
- [ ] File scope enforced: blocklisted files stripped/blocked before scanning
- [ ] Secret scanner detects all 10+ defined patterns
- [ ] PII scanner detects email, phone, and national ID patterns
- [ ] Policy engine evaluates rules (including file scope) and returns correct decisions
- [ ] Redactor replaces secrets with typed placeholder tokens
- [ ] Logger writes sanitized entries to SQLite with zero raw secret leakage
- [ ] Dashboard displays logs, risk score, file scope tree, and policy settings
- [ ] VS Code extension redirects AI traffic through proxy and enforces file scope
- [ ] Browser extension intercepts web-based AI tool requests
- [ ] All critical test cases pass (including file scope tests)
- [ ] Performance targets met (<50ms overhead, <200MB memory)

### Phase 2 is complete when:

- [ ] Smart router correctly routes based on risk score
- [ ] Local LLM integration works via Ollama
- [ ] AI Leak Simulator generates reports respecting file scope
- [ ] Per-project `.aifirewall.json` overrides work (including file scope overrides)
- [ ] ML-assisted scanner reduces false positives by measurable amount

### Phase 3 is complete when:

- [ ] Organization dashboard with multi-user support
- [ ] RBAC enforced correctly for all roles
- [ ] Compliance exports generated and validated
- [ ] Air-gapped deployment tested successfully
- [ ] CI/CD hooks functional (pre-commit, GitHub Action, CLI)

### Phase 4 is complete when:

- [ ] 3+ AI providers configurable with encrypted API keys
- [ ] Model registry auto-populated when providers are added
- [ ] Requests route to correct provider/model with key injection
- [ ] Credit limits enforced: hard limits block, soft limits warn
- [ ] Usage tracked with token counts and cost per request
- [ ] Dashboard shows credit status, usage trends, cost breakdown
- [ ] Plan templates available and applicable
- [ ] API keys never appear in logs, responses, or error messages
- [ ] Concurrent credit updates are atomic (no race conditions)

---

*End of Document*


*End of Document*
