# Privacy Audit & Leak Detection — Design Document

## Purpose

Provide a detailed design and implementation plan for the Privacy Audit & Leak Detection feature: BlindMI prefilter, GitHub/repo cross-check, human review workflow, and integration with pre-flight estimation.

## Components

1. BlindMI Module (`proxy/src/audit/blindMi.ts`)
   - Input: model outputs (strings) and optional token log-probs when provider exposes them.
   - Multi-signal approach (weighted combination):
     - **Entropy signal (weight 0.4)**: Uses Shannon entropy-based high-entropy token detection as a proxy for memorized content.
     - **N-gram repetition (weight 0.3)**: Analyses character 3-grams and word bigrams — memorized text tends to exhibit distinct repetition patterns.
     - **Vocabulary richness (weight 0.2)**: Type-token ratio (TTR) — memorized code typically has low vocabulary diversity.
     - **Code structure density (weight 0.1)**: Measures brackets, semicolons, keywords, camelCase patterns — memorized code snippets have characteristic structural density.
   - Formula: `blindMiScore = 0.4 × entropy + 0.3 × ngramRepetition + 0.2 × vocabRichness + 0.1 × codeStructure`
   - Output: `blindMiScore` (0–1), candidate subsequences, full `signals` breakdown.

2. GitHub/Repo Search Helper (`proxy/src/tools/githubSearch.ts`)
   - Uses GitHub Search API (token optional) or internal repo search.
   - Returns hitCount and cached results; configurable threshold for trust (default 100).
   - Caches queries for configurable TTL.

3. Audit Queue API (`proxy/src/routes/audit.route.ts`)
   - POST `/api/audit/queue` — enqueue candidate (admin/role-gated)
   - GET `/api/audit/queue` — paginated list for dashboard review
   - POST `/api/audit/action` — actions: approve, redact, block, annotate

4. Dashboard Audit UI (`dashboard/src/pages/Audit.tsx`)
   - Shows masked snippet, blindMiScore, GitHub hitCount, suggested remediation.
   - Buttons: Redact & Send, Block, Add to Policy (blocked_paths), Mark False Positive.

5. Pre-flight integration (`routes/estimate.route.ts`)
   - Optional privacyRisk field returned when audit is enabled.
   - privacyRisk composed from BlindMI score + GitHub hit heuristics + PII/secret scan results.

## Dataflow

User prompt → `/api/estimate` → scanner + blindMi (if enabled) → GitHub search (if enabled) → compute privacyRisk → return to extension → user confirms → `/v1/chat/completions` forwards prompt (sanitized if chosen) → record real usage → if audit flagged, create audit queue item with response snippet.

## Ethical & Security Controls
- Opt-in per project and per user; defaults off.
- Storage: mask displayed snippets in UI; raw values stored encrypted in `token_vault` only accessible to admins.
- Retention policy configurable; default 30 days for audit candidates.
- Human reviewer actions logged and auditable.

## Config & Policies
- `policy.json` flags:
  - `audit.enabled` (bool)
  - `audit.privacyRiskThreshold` (float 0–1)
  - `audit.githubHitThreshold` (int)
  - `audit.useSurrogateModel` (bool)

## Testing
- Unit tests for BlindMI using CodeParrot/StarCoder fixtures.
- Integration tests: estimate → privacyRisk → enqueue → dashboard review flow.

## Limitations
- BlindMI uses heuristic signals in the absence of provider log-probs; when log-probs are available the accuracy improves significantly.
- GitHub search is heuristic and may miss deleted or private training data.
- The multi-signal scorer is calibrated for code-generation models; prose-heavy outputs may require threshold tuning.

## Implementation Status
- [x] BlindMI multi-signal module with weighted scoring (entropy, n-gram, vocab, code structure)
- [x] GitHub search helper with caching
- [x] Audit queue API (enqueue, list, action)
- [x] Dashboard Audit UI with Approve/Redact/Block/False Positive actions
- [x] Pre-flight `privacyRisk` integration in `/api/estimate`
- [x] Opt-in configuration via `policy.json` → `audit.enabled`

