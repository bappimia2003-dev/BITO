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
