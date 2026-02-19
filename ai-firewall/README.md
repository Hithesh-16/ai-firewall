# AI Firewall

**Cloudflare for AI Requests** — A local-first AI security gateway that protects developers from AI data leaks.

AI Firewall sits between your development tools (VS Code, browsers, CLI) and AI providers (OpenAI, Anthropic, Google, local LLMs). It intercepts every AI-bound request, scans for secrets, PII, and sensitive business logic, then blocks, redacts, or forwards the cleaned prompt — all before data ever leaves your machine.

## Architecture

```
Developer Machine
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│  VS Code Extension    Browser Extension    CLI Tool          │
│  (inline completions, (intercepts ChatGPT,  (scan, status,  │
│   chat, code actions)  Claude, Gemini)       export)         │
│         │                    │                  │            │
│         └────────────────────┼──────────────────┘            │
│                              ▼                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │          AI Firewall Proxy (localhost:8080)           │    │
│  │                                                      │    │
│  │  Scanner Pipeline:                                   │    │
│  │   ├── Secret Scanner (12 patterns)                   │    │
│  │   ├── PII Scanner (7 patterns)                       │    │
│  │   ├── Entropy Scanner (high-entropy detection)       │    │
│  │   └── Context-Aware Scorer (path-based adjustment)   │    │
│  │                                                      │    │
│  │  Policy Engine ──► Redaction Engine                   │    │
│  │  Smart Router  ──► Local LLM / Cloud AI              │    │
│  │  AI Gateway    ──► BYOK Multi-Provider Routing       │    │
│  │  Credit Manager──► Usage Tracking + Limits           │    │
│  │  Token Vault   ──► Reversible Tokenization           │    │
│  │  Logger        ──► SQLite (sanitized audit trail)    │    │
│  └──────────────────────────────────────────────────────┘    │
│                              │                               │
│  Dashboard (localhost:3000)  │                               │
│  ├── Overview & Stats        │                               │
│  ├── Request Log             │                               │
│  ├── Risk Score              │                               │
│  ├── Secret Types            │                               │
│  ├── Timeline                │                               │
│  └── Policy Config           │                               │
└──────────────────────────────┼───────────────────────────────┘
                               ▼
                    AI Providers (OpenAI, Anthropic,
                    Google, Ollama / Local LLMs)
```

## Quick Start

```bash
# 1. Start the proxy server
cd proxy
cp .env.example .env     # edit with your settings
npm install
npm run build
npm start

# 2. Start the dashboard
cd dashboard
npm install
npm run dev              # → http://localhost:3000

# 3. Install VS Code extension
cd extension
npm install
npm run build
# Press F5 in VS Code to launch extension development host

# 4. Install browser extension
# Chrome → chrome://extensions → Load unpacked → select browser-extension/
```

### Docker (Air-Gapped)

```bash
docker compose up -d

# With local LLM support
docker compose --profile local-llm up -d
```

## Products

### Proxy Server (`proxy/`)

Core interception engine. Runs on `localhost:8080`.

| Endpoint | Purpose |
|---|---|
| `POST /v1/chat/completions` | OpenAI-compatible proxy with scanning |
| `POST /api/estimate` | Pre-flight cost estimation |
| `POST /api/browser-scan` | Lightweight scan for browser extension |
| `POST /api/permission-check` | Interactive permission prompt |
| `GET /api/logs` | Paginated audit logs |
| `GET /api/stats` | Aggregated statistics |
| `GET /api/risk-score` | Project risk score |
| `GET/PUT /api/policy` | Policy configuration |
| `POST /api/simulate` | AI Leak Simulator |
| `CRUD /api/providers` | BYOK provider management |
| `CRUD /api/credits` | Credit limit management |
| `GET /api/usage/summary` | Usage tracking |
| `POST /api/vault/resolve` | Reverse tokenization (admin) |
| `GET /health` | Health check |

### Dashboard (`dashboard/`)

React + Vite + Tailwind web UI at `localhost:3000`.

6 views: Overview, Request Log, Risk Score, Secret Types, Timeline, Policy Config.

### VS Code Extension (`extension/`)

Full AI coding assistant with security built in:

- **Inline completions** — ghost text as you type (Tab to accept)
- **Inline chat** — Cmd+I to edit/generate code in place
- **Sidebar chat** — full chat interface with model selection
- **Code actions** — lightbulb menu (explain, refactor, fix, document, test)
- **CodeLens** — inline annotations on lines containing secrets
- **Pre-flight estimation** — see cost/tokens before sending
- **BYOK provider management** — add your own API keys
- **Credit control** — track and limit usage per model

### Browser Extension (`browser-extension/`)

Chrome Manifest V3 extension that intercepts AI requests on ChatGPT, Claude, and Gemini:

- Patches `window.fetch` to scan messages before they leave the browser
- Blocks requests containing critical secrets (private keys, AWS keys)
- Redacts PII and tokens automatically before sending
- Shows real-time banners on AI chat pages
- Popup dashboard with stats and activity log

### CLI Tool (`cli/`)

```bash
aifirewall scan ./src          # Scan directory for secrets
aifirewall status              # Check proxy health
aifirewall stats               # View request statistics
aifirewall export json         # Export audit logs
```

## CI/CD Integration

### Pre-commit Hook

```bash
cp hooks/pre-commit .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit
```

### GitHub Action

The `.github/workflows/ai-firewall-scan.yml` workflow scans PRs for AI-leakable content.

## Security

- **Local-first** — all data stays on your machine
- **Zero telemetry** — no phone-home, no external network calls from scanner
- **No raw secrets stored** — only sanitized text + SHA-256 hash in SQLite
- **Encrypted API key vault** — AES-256-GCM encryption for stored provider keys
- **Reversible tokenization** — admin-controlled vault for forensic investigation
- **Input validation** — all requests validated with Zod

## License

MIT
