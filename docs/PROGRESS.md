# BITO Build Progress

## Phase 0 — Bootstrap

- **Status**: GREEN
- **Built**:
  - pnpm workspace (`apps/web`, `packages/{shared,engine,integrations,nodes}`)
  - Strict TypeScript configuration (`strict: true`, `noUncheckedIndexedAccess: true`)
  - ESLint flat config with layer-boundary enforcement & console restrictions
  - Prettier & Vitest configurations (unit, integration, acceptance)
  - `packages/shared`: errors (`BitoError`, Appendix 22.1 codes), redaction, logger, domain types
  - `packages/engine`: Pure interfaces (`ExecutionStore`, `Clock`, `SafeHttp`, `CredentialResolver`)
  - `apps/web`: Next.js 15 App router, theme provider, boot env validation, `GET /api/health`
  - `scripts/`: `migrate.ts`, `gen-key.ts`, `scan-secrets.ts`
  - Tests: shared errors/redact/logger, web env/health, programmatic layer-boundary lint test

---

## Phase 1 — Database & repository foundation

- **Status**: GREEN
- **Built**:
  - Migrations 0001-0008: auth, projects, workflows, credentials, execution, files, webhooks, audit
  - Connection pooler client (`apps/web/src/server/db/client.ts`): `prepare: false`, `ssl: 'require'`, transactions
  - `apps/web/src/server/auth/rbac.ts`: `assertProjectRole` enforcing `owner` > `editor` > `viewer`
  - `apps/web/src/server/http/withRoute.ts`: Shared API route wrapper with CSRF check, rate limiting, Zod parsing
  - `apps/web/src/server/security/rateLimit.ts`: Atomic upsert rate limiter on `rate_limits` table
  - Repositories: audit (append-only), users, projects, workflows, credentials, executions, files, variables, tables, webhooks, schedules
  - Tests: migration idempotency, RLS enabled, audit immutability, FK/unique checks, 20 concurrent rate-limit upserts

---

## Phase 2 — Authentication

- **Status**: GREEN
- **Built**:
  - Argon2id password hashing, constant-time verification, min-10 chars, top-1000 blacklist, dummy timing equalization
  - Session management: 32-byte crypto tokens, SHA-256 hashed in DB, 7d sliding / 30d absolute SQL `NOW()` expiration, secure cookies
  - WebAuthn passkeys: `@simplewebauthn/server` registration/login/reauth, 5-min challenges, counter regression rejection, last-login defense
  - Re-auth enforcement: `requireRecentAuth(300)` returning 401 `REAUTH_REQUIRED`
  - Login throttling: 5 failed attempts per (email, IP) within 15 min returning 429 `RATE_LIMITED`
  - Auth routes: `/api/auth/register`, `/login`, `/logout`, `/logout-all`, `/reauth`, `/me`, `/change-password`, passkey routes
  - UI: `/login`, `/register`, `/settings/security` (passkey CRUD, password change), `ReauthModal`
  - Tests: Software authenticator helper, Section 14.5 test matrix (CSRF, throttling, expiry, re-auth, passkeys, IDOR)

---

## Phase 3 — Projects, roles & app shell

- **Status**: GREEN
- **Built**:
  - Project & workflow repositories: CRUD, member roles, duplicate workflow cloning nodes/connections, pooler text mode safety
  - Migration 0009: `audit_logs_immutable` refined for ON DELETE SET NULL cascades while preventing direct modification
  - API routes: `/api/projects`, `/api/projects/[id]`, `/api/projects/[id]/members`, `/api/projects/[id]/workflows`, `/api/workflows/[id]`, `/api/workflows/[id]/duplicate`, `/api/projects/[id]/audit`
  - Authenticated App Shell: responsive layout with desktop sidebar, top bar, and 375px mobile slide-over drawer
  - UI pages: `/projects` (cards, roles, create), `/projects/[id]/workflows` (table, actions, duplicate, delete), `/projects/[id]/settings` (members, audit trail, danger zone)
  - Tests: IDOR matrix, viewer vs editor vs owner RBAC matrix, workflow duplication, sole-owner demote defense

---

## Phase 4 — Credential manager + Variables

- **Status**: GREEN
- **Built**:
  - AES-256-GCM encryption with random 12-byte IV, AAD bound to `credentialId`, versioned key rotation (`apps/web/src/server/security/crypto.ts`)
  - Supported credentials: `telegramBot`, `geminiApiKey`, `whatsappCloud`, `metaPage`, `googleOAuth`, `httpBearer`, `httpBasic`, `httpHeader`
  - Secret immutability: write-only creation/replacement, zero plaintext leakage in APIs, masked hints (`maskSecret`)
  - Dependency protection: 409 `CREDENTIAL_IN_USE` rejection on deleting credentials bound to workflow nodes
  - Credential testers: 10s timeout, redacted logging for Telegram, Gemini, WhatsApp, Meta, Google
  - Variables subsystem: `global`, `project`, `workflow` scopes; identifier naming regex; rich JSON values
  - API routes: `/api/credentials`, `/api/credentials/[id]`, `/api/credentials/[id]/dependencies`, `/api/credentials/[id]/test`, `/api/variables`, `/api/variables/[id]`
  - UI pages: `/projects/[id]/credentials` (CRUD, test, replace secret modal, re-auth step-up), `/projects/[id]/variables` (scoped tabs, JSON editor)
  - Tests: crypto unit suite (roundtrip, tamper, AAD, rotation), snapshot zero-leak tests, 409 dependency rejection, variables CRUD/IDOR

---

## Phase 5 — Pure core: types, expressions, registry, validator

- **Status**: GREEN
- **Built**:
  - Shared node domain types (`packages/shared/src/nodeTypes.ts`): `PortDef`, `NodeCategory`, `FieldDef`, `NodeSettings`, `NodeResult`, `NodeContext`, `Issue`, `GraphView`, `ToolSpec`, `AiStep`, `CatalogNode`, and `ConfigSchema<TConfig>` (Zod variance safe)
  - Expression engine (`packages/engine/src/expressions/`):
    - Hand-written Pratt parser + tokenizer (`parser.ts`, `tokenizer.ts`)
    - 28 pure filters (`filters.ts`): string, numeric, collection, object, type cast, URL/encoding
    - AST depth limit (30), expression length cap (2000 chars), strict prototype pollution defense (`__proto__`, `constructor`, `prototype`)
    - Short-circuit boolean logic (`&&`, `||`), unary expressions, ternary operator, bracket & dot property paths
    - Template string interpolation engine (`template.ts`) supporting nested `{{ ... }}`
  - Graph validator (`packages/engine/src/validator/`):
    - `graphTraversal.ts`: `buildUpstreamMap`, `findReachableNodes`, `detectIllegalCycle`
    - `validateGraph.ts`: checks all 14 Section 8.11 issue codes (`NO_TRIGGER`, `NODE_TYPE_UNKNOWN`, `CONFIG_INVALID`, `EXPR_SYNTAX`, `EXPR_REF_NOT_UPSTREAM`, `CREDENTIAL_MISSING`, `CREDENTIAL_TYPE_MISMATCH`, `PORT_INVALID`, `CYCLE_NOT_ALLOWED`, `UNREACHABLE_NODE`, `MERGE_NEEDS_TWO_INPUTS`, `CONVERGENCE_WITHOUT_MERGE`, `DUPLICATE_KEY`, `TRIGGER_CONFLICT`, `FOREACH_LOOP_TARGET`)
  - Execution primitives:
    - Delivery planner (`packages/engine/src/delivery/planDeliveries.ts`): port routing, item fan-out, empty array handling
    - Retry backoff (`packages/engine/src/retry/backoff.ts`): fixed & exponential, ±20% jitter, cap 300,000 ms, `retryAfterMs` support
    - In-memory execution store (`packages/engine/src/testing/inMemoryExecutionStore.ts`): deterministic test store
    - Node registry (`packages/engine/src/registry/nodeRegistry.ts`): registry container, catalog metadata generator
  - Standard nodes (`packages/nodes/src/`): 11 node definitions (`trigger.manual`, `trigger.webhook`, `data.set`, `logic.if`, `logic.noop`, `logic.wait`, `logic.stop`, `logic.merge`, `logic.foreach`, `api.http`, `telegram.send`)
  - Catalog API (`apps/web/src/app/api/nodes/catalog/route.ts`): `GET /api/nodes/catalog` route returning validated node metadata
  - Tests & Verification:
    - 48 expression tests (`packages/engine/tests/expressions.test.ts`)
    - 16 validator tests across 14 issue codes (`packages/engine/tests/validator_basic.test.ts`, `validator_advanced.test.ts`)
    - 9 delivery & backoff unit tests (`packages/engine/tests/deliveries_backoff.test.ts`)
    - 10 in-memory execution store tests (`packages/engine/tests/inMemoryStore.test.ts`)
    - 4 node registry & catalog consistency tests (`packages/nodes/tests/registry.test.ts`)
    - Catalog API route unit test (`apps/web/tests/catalog.test.ts`)
    - Line coverage > 91% across `packages/engine` (all subpackages ≥ 88.6%, delivery/registry/retry at 100%)
    - 124 unit tests + 33 integration tests passing

- [x] **Phase 6: Engine core on Postgres + first nodes**
  - Completed: 2026-09-29
  - Deliverables:
    - `SafeHttp` outbound HTTP client with multi-layer SSRF defense (`apps/web/src/server/security/safeHttp.ts`) blocking loopback, private ranges, RFC 6598 CGNAT, link-local metadata (169.254.169.254), IPv6 mapped IPv4, and re-validating redirects.
    - SafeHttp test suite with 5 unit tests (`apps/web/tests/safeHttp.test.ts`).
    - `PostgresExecutionStore` (`apps/web/src/server/engine-runtime/postgresExecutionStore.ts`) implementing `ExecutionStore` with `FOR UPDATE SKIP LOCKED` atomic job claiming, stale lease reclamation, scratch locking, and immutable audit logs.
    - Pure engine job processor (`packages/engine/src/runtime/processJob.ts`, `buildScope.ts`, `resolveConfig.ts`, `handleError.ts`) supporting sequential execution, parallel branches, IF condition routing, wait/resume with clock advance, configurable retries with jittered backoff, error policies (`stop`, `continue`, `errorPort`), and `perItem` progress skipping on retry.
    - Core execution triggers and endpoints: `startExecution`, `runTick`, `retryExecution`, `POST /api/engine/tick`, `POST /api/executions/:id/cancel`, `POST /api/executions/:id/retry`.
    - Unit test suites: `processJob_basic.test.ts`, `processJob_lifecycle.test.ts`, `processJob_resilience.test.ts`, `processJob_errors.test.ts`.
    - Live Postgres integration test suite (`tests/integration/phase6_engine.test.ts`): Idempotent job delivery, stale-lease reclamation, live outbound HTTP to `https://example.com` via `SafeHttp`, cancel execution endpoint, retry from failed execution endpoint.
    - Live Postgres concurrency test suite (`tests/integration/phase6_concurrency.test.ts`): 4 parallel workers executing 20 jobs simultaneously verifying `FOR UPDATE SKIP LOCKED` with 0 duplicate executions and 0 deadlocks.
    - Verification: 140 unit tests passing, 39 integration tests passing, zero secrets committed, all files strictly $\le 400$ lines.

---

## Phase 7 — Workflow editor UI + execution logs

- **Status**: GREEN
- **Completed**: 2026-09-29
- **Built**:
  - Interactive React Flow canvas (`@xyflow/react`) with custom node status indicators (`CustomWorkflowNode.tsx`), animated connection curves, 16px grid snapping, minimap, background dot grid, zoom/pan controls.
  - Searchable, categorized node palette (`NodePalette.tsx`) with drag-and-drop and click-to-add support.
  - Command palette quick-add modal (`QuickAddModal.tsx`, `/` or `Ctrl/Cmd+K`) for keyboard-driven canvas node creation.
  - Full-featured node configuration drawer (`NodeConfigPanel.tsx`):
    - Dynamic schema-driven form generator (`FormGenerator.tsx`) supporting text, textarea, number, select, boolean, JSON, and credential selectors.
    - Expression input component (`ExpressionInput.tsx`) with `{}` toggle, autocomplete tokens (`{{input.`, `{{trigger.`, `{{nodes.<key>.json.`, `{{vars.`), and live expression preview against backend evaluation.
    - Settings tab for retry count, backoff policy (`fixed`/`exponential`), error handling strategy (`stop`/`continue`/`errorPort`), timeout, and active/disabled toggle.
    - Output inspector and execution trace view.
  - State management & history:
    - 50-step undo/redo stack (`useEditorHistory.ts`) with keyboard shortcuts (`Ctrl/Cmd+Z`, `Ctrl/Cmd+Y` / `Ctrl/Cmd+Shift+Z`).
    - 1.5s debounced autosave with optimistic revision tracking (`useEditorAutosave.ts`).
    - HTTP 409 conflict detection with interactive resolution modal (`ConflictModal.tsx`: "Reload latest" vs "Overwrite").
  - Execution & debugging:
    - Execution controller (`useEditorExecution.ts`) for starting, polling, and canceling workflow runs.
    - Manual run modal (`RunModal.tsx`) with trigger node selector and test payload JSON editor.
    - Collapsible execution logs drawer (`ExecutionLogsPanel.tsx`) with real-time status polling, timeline overview, execution history list, node run inspect pane, and full JSON payload viewer.
  - Pages & API routes:
    - Full-screen editor route: `/workflows/[id]/editor` and project redirect `/projects/[id]/workflows/[workflowId]/editor`.
    - Project execution list route: `/projects/[id]/executions` with status filters and duration metrics.
    - Single execution drill-down route: `/projects/[id]/executions/[execId]` with visual split layout.
    - Backend endpoints: `GET/PATCH /api/workflows/:id`, `POST /api/workflows/:id/run`, `POST /api/workflows/:id/validate`, `POST /api/workflows/:id/expressions/preview`, `GET /api/executions/:id`, `GET /api/executions/:id/logs`, `GET /api/projects/:id/executions`.
- **Verification**:
  - 140/140 unit tests passing.
  - 53/53 integration tests passing against live Supabase PostgreSQL (including `phase7_editor_api.test.ts` and `phase7_smoke.test.ts` with Manual + Set + IF end-to-end execution, cycle detection, connection validation, 409 conflict handling).
  - Next.js production build succeeded (`28/28` routes generated).
  - Prettier & ESLint passing with 0 errors/warnings.
  - Secret scan passing with 0 secrets detected.
  - Every file in the repository strictly $\le 400$ lines.
