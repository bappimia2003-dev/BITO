# BITO Build Progress

## Phase 0 — Bootstrap

### Plan (<= 15 lines)

1. Initialize pnpm workspace (apps/web, packages/{shared,engine,integrations,nodes}) with root package.json.
2. Configure TypeScript strict configs across all workspaces.
3. Configure ESLint flat config with layer-boundary rules enforcing import restrictions.
4. Configure Prettier, Vitest configs, and required root npm scripts.
5. Implement packages/shared with types, BitoError, error codes, logger, and redaction helpers.
6. Create packages/{engine,integrations,nodes} scaffolding adhering to import rules.
7. Implement scripts/migrate.ts, scripts/gen-key.ts, and scripts/scan-secrets.ts.
8. Create env validation in apps/web, .env.example, and .gitignore.
9. Scaffold Next.js in apps/web with base layout, theme provider, and GET /api/health route.
10. Run Phase 0 gate (pnpm verify, lint test for engine layer boundaries, local health route).

### Status

- GREEN

### Built

- pnpm workspace (`apps/web`, `packages/{shared,engine,integrations,nodes}`)
- Strict TypeScript configuration across workspaces (`strict: true`, `noUncheckedIndexedAccess: true`)
- ESLint flat configuration (`eslint.config.mjs`) with layer-boundary rules and console restrictions
- Prettier (`.prettierrc`, `.prettierignore`) and Vitest configs (`vitest.config.ts`, `vitest.integration.config.ts`, `vitest.acceptance.config.ts`)
- `packages/shared`:
  - `src/errors.ts`: `BitoError` and complete list of error codes from Appendix 22.1
  - `src/redact.ts`: Sensitive field regex & active secret replacement with circular reference safety
  - `src/logger.ts`: Structured JSON lines logger with context and redaction
  - `src/types.ts`: Domain types (`Item`, `Execution`, `NodeRun`, `WorkflowSnapshot`, etc.)
- `packages/engine`: Pure engine interfaces (`ExecutionStore`, `Clock`, `SafeHttp`, `CredentialResolver`)
- `packages/integrations`: Integrations package scaffolding
- `packages/nodes`: Nodes package scaffolding
- `apps/web`:
  - Next.js 15 App router app with dark/light `ThemeProvider`
  - `src/server/env.ts`: Boot-time Zod environment validation, `CREDENTIAL_ENCRYPTION_KEY` 32-byte check, `NEXT_PUBLIC_*` restriction
  - `src/app/api/health/route.ts`: `GET /api/health` route returning `{ ok: true, db: boolean, version: string }`
- `scripts/`:
  - `scripts/migrate.ts`: Migration runner tracking `schema_migrations`
  - `scripts/gen-key.ts`: 32-byte base64 encryption key generator
  - `scripts/scan-secrets.ts`: Secret detector script
- Tests:
  - `packages/shared/tests/errors.test.ts`
  - `packages/shared/tests/redact.test.ts`
  - `packages/shared/tests/logger.test.ts`
  - `apps/web/tests/env.test.ts`
  - `apps/web/tests/health.test.ts`
  - `tests/unit/layer-boundary-lint.test.ts`: Programmatic lint test proving `packages/engine` importing `next` or `postgres` fails lint
- `README.md`, `.env.example`, `.gitignore`

### Known Issues / Not Done

- None.

### Deviations From Spec

- None.

---

## Phase 1 — Database & repository foundation

### Plan (<= 15 lines)

1. Write 0001 through 0008 migration SQL files in db/migrations/ adhering strictly to Section 5.
2. Verify scripts/migrate.ts applies all migrations idempotently and records schema_migrations.
3. Implement pooler-safe postgres client (apps/web/src/server/db/client.ts) with prepare: false and ssl: require.
4. Implement transaction helper and row mapper base utilities (snake_case DB -> camelCase domain).
5. Implement assertProjectRole authorization helper in apps/web/src/server/auth/rbac.ts.
6. Implement withRoute HTTP wrapper skeleton in apps/web/src/server/http/withRoute.ts.
7. Implement rate-limit helper in apps/web/src/server/security/rateLimit.ts.
8. Implement audit log helper in apps/web/src/server/repositories/audit.ts.
9. Implement repository scaffolding in apps/web/src/server/repositories/.
10. Write integration tests: migration idempotency, FK/unique/check constraints, audit immutability, RLS, 20 concurrent rate-limit upserts.
11. Run Phase 1 gate (pnpm verify + integration tests), update docs, and send Phase 1 report.

### Status

- GREEN

### Built

- Database Migrations (`db/migrations/`):
  - `0001_extensions.sql`: `pgcrypto`, `citext`
  - `0002_auth.sql`: `users`, `webauthn_credentials`, `webauthn_challenges`, `sessions`
  - `0003_projects_workflows.sql`: `projects`, `project_members`, `workflows`, `nodes`, `connections`, `workflow_versions`
  - `0004_credentials_variables.sql`: `credentials`, `variables`, unique scope indexes
  - `0005_execution.sql`: `executions`, `node_runs`, `jobs`, `execution_scratch`, `logs`
  - `0006_files_data.sql`: `files`, `data_tables`, `data_rows` with GIN index
  - `0007_webhooks_schedules.sql`: `webhook_endpoints`, `webhook_events`, `schedules`, `rate_limits`
  - `0008_security.sql`: `audit_logs` (append-only trigger) and RLS enabled across all public tables
- Server Foundation:
  - `apps/web/src/server/db/client.ts`: Connection pooler client (`prepare: false`, `ssl: 'require'`), `withTransaction` helper
  - `apps/web/src/server/auth/rbac.ts`: `assertProjectRole` enforcing hierarchy (`owner` > `editor` > `viewer`) and project isolation
  - `apps/web/src/server/http/withRoute.ts`: Shared API route wrapper with CSRF check, rate limiting, Zod parsing, error mapping
  - `apps/web/src/server/security/rateLimit.ts`: Atomic upsert rate limiter using Postgres `rate_limits` table
  - `apps/web/src/server/repositories/`:
    - `base.ts`: Snake_case DB -> camelCase domain row mapper
    - `audit.ts`: Immutable audit logger with automatic secret redaction
    - `users.ts`, `projects.ts`, `workflows.ts`, `credentials.ts`, `executions.ts`, `files.ts`, `variables.ts`, `dataTables.ts`, `webhooks.ts`, `schedules.ts`
- Tests:
  - `tests/integration/phase1.test.ts`: 5 comprehensive integration tests verifying:
    1. Migration idempotency (re-run is a clean no-op, all 8 recorded)
    2. RLS enabled on all public tables
    3. `audit_logs` immutable (UPDATE and DELETE blocked by trigger)
    4. FK, unique, and check constraints enforced
    5. Rate-limit upsert counts accurately under 20 concurrent calls
  - `apps/web/tests/withRoute.test.ts`: withRoute error mapping, Zod parsing, CSRF checks
  - `apps/web/tests/health.test.ts`: verified `GET /api/health` returns `db: true` with live database

### Known Issues / Not Done

- None.

### Deviations From Spec

- None.

---

## Phase 2 — Authentication

### Plan (<= 15 lines)

1. Implement password utilities: argon2id hashing/verify, min-10 char check, top-common password list, dummy hash timing equalization.
2. Implement session management: 32-byte random token, sha256 hash storage, 7-day idle sliding / 30-day absolute expiration, secure cookie helpers.
3. Implement WebAuthn passkey helpers using @simplewebauthn/server: single-use 5-min challenge, registration & verification, counter checks.
4. Implement re-authentication helper: requireRecentAuth(maxAgeSec = 300) and session last_auth_at updates for sensitive actions.
5. Implement login throttling: 5 failed attempts per (email, IP) per 15 min returning 429 and auth audit events.
6. Implement auth API routes: /api/auth/register, /login, /logout, /logout-all, /reauth, /me.
7. Implement passkey API routes: register options/verify, login options/verify, reauth options/verify, passkeys list/delete.
8. Wire withRoute to authenticate session cookies, attach user to context, and enforce requireRecentAuth.
9. Build auth and security UI: /login, /register, and /settings/security (passkey management, password change).
10. Build test software authenticator and tests for all Section 14.5 cases (CSRF, throttling, expiry, re-auth, passkeys, IDOR, ALLOW_REGISTRATION).
11. Run Phase 2 gate (pnpm verify + integration tests), verify manual browser flow, update PROGRESS.md, and send report.

### Status

- GREEN

### Built

- Password security:
  - Argon2id password hashing and constant-time verification (`apps/web/src/server/auth/passwords.ts`)
  - Minimum 10-character length policy and rejection of top-1000 common passwords (`apps/web/src/server/auth/commonPasswords.ts`)
  - Constant-time dummy verification (`dummyVerifyPassword`) to eliminate user-enumeration timing oracles
- Session management:
  - 32-byte cryptographically secure random session tokens, SHA-256 hashed in database (`apps/web/src/server/repositories/sessions.ts`)
  - Sliding 7-day idle expiration and 30-day absolute expiration computed via Postgres `NOW()` SQL expressions to prevent client/server clock skew
  - Secure HTTP-only cookies (`__Host-bito_session` in production, `bito_session` in dev) with `SameSite=Lax` and path `/` (`apps/web/src/server/auth/cookies.ts`)
  - Session revocation (`revokeSession`, `revokeAllUserSessions`) and `last_auth_at` tracking
- WebAuthn Passkeys:
  - Passkey registration, authentication, and re-authentication via `@simplewebauthn/server` (`apps/web/src/server/auth/passkeyRegistration.ts`, `passkeyAuth.ts`, `webauthnService.ts`)
  - 5-minute single-use cryptographic challenges stored in DB with SQL `NOW()` expiration (`apps/web/src/server/repositories/webauthn.ts`)
  - Sign counter tracking and rollback regression rejection
  - Last-login-method defense preventing users from deleting their sole login credential
- Security & Middleware:
  - Re-authentication enforcement (`requireRecentAuth(300)`) returning 401 `REAUTH_REQUIRED` for sensitive operations (`apps/web/src/server/auth/recentAuth.ts`)
  - Login rate throttling: 5 failed attempts per (email, IP) within 15 minutes triggering 429 `RATE_LIMITED` (`apps/web/src/server/auth/throttle.ts`)
  - CSRF origin validation against trusted host / Origin headers in `withRoute.ts`
  - Unified HTTP route wrapper `withRoute` resolving session, checking recent-auth, and enforcing project RBAC
- Auth & Passkey API Endpoints:
  - `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `POST /api/auth/logout-all`, `POST /api/auth/reauth`, `GET /api/auth/me`, `POST /api/auth/change-password`
  - `POST /api/auth/passkey/register/options`, `POST /api/auth/passkey/register/verify`
  - `POST /api/auth/passkey/login/options`, `POST /api/auth/passkey/login/verify`
  - `POST /api/auth/passkey/reauth/options`, `POST /api/auth/passkey/reauth/verify`
  - `GET /api/auth/passkeys`, `DELETE /api/auth/passkeys/[id]`
- UI & Client Integration:
  - Browser WebAuthn client wrapper (`apps/web/src/lib/passkeyClient.ts`)
  - Login page (`/login`) with dual password and passkey sign-in flows
  - Registration page (`/register`) supporting password and passkey-only onboarding, with post-registration passkey promotion
  - Security settings page (`/settings/security`) with passkey list/add/delete, password change, and global session signout
  - Interactive re-auth modal component (`apps/web/src/components/auth/ReauthModal.tsx`) for step-up auth
- Tests & Verification:
  - Software authenticator helper (`tests/helpers/softwareAuthenticator.ts`) creating valid ES256 attestation and assertion signatures
  - Section 14.5 test matrix: 9 password & session integration tests (`tests/integration/phase2_auth.test.ts`) + 7 passkey integration tests (`tests/integration/phase2_passkeys.test.ts`)
  - All 21/21 integration tests passing against live Supabase PostgreSQL
  - Full Next.js production build (`pnpm verify`) passes cleanly with 22 routes generated

### Known Issues / Not Done

- None.

### Deviations From Spec

- None.

---

## Phase 3 — Projects, roles & app shell

### Plan (<= 15 lines)

1. Extend projects repo with update, member management (add, update role, remove), and ownership checks.
2. Extend workflows repo with update, duplicate workflow (copying nodes/connections/settings), and delete.
3. Implement Projects API routes: GET/POST /api/projects, GET/PATCH/DELETE /api/projects/[id].
4. Implement Project Members API routes: GET/POST/PATCH/DELETE /api/projects/[id]/members.
5. Implement Workflows API routes: GET/POST /api/projects/[id]/workflows, GET/PATCH/DELETE /api/workflows/[id], POST /api/workflows/[id]/duplicate.
6. Implement Audit API route: GET /api/projects/[id]/audit (owner-only cursor-based paginated logs).
7. Build authenticated App Shell layout with responsive drawer (usable at 375px), sidebar, top bar, theme toggle.
8. Build /projects page with project cards, role badges, and create project modal.
9. Build /projects/[id]/workflows list page with status badges, create, rename, duplicate, and delete flows.
10. Build /projects/[id]/settings page with members management, audit log viewer, and danger zone.
11. Write integration test suite: IDOR matrix tests, role permission matrix tests, member CRUD, and duplicate workflow.
12. Run Phase 3 gate (pnpm verify), verify 375px mobile responsiveness, update PROGRESS.md, and send report.

### Status

- GREEN

### Built

- Projects & Workflows Repositories:
  - `apps/web/src/server/repositories/projects.ts`: Project CRUD, user projects with role annotations, member management (add by email, update role, remove member), sole-owner demote/delete defenses.
  - `apps/web/src/server/repositories/workflows.ts`: Workflow CRUD, list workflows with subquery for last execution status, duplicate workflow cloning all nodes and connections with mapped IDs, safe JSON preprocessing for connection pooler text mode.
  - `db/migrations/0009_audit_cascade_fix.sql`: Refined `audit_logs_immutable` trigger allowing foreign key `ON DELETE SET NULL` cascading from deleted projects/users while maintaining strict immutability against tampering or direct deletions.
- API Endpoints:
  - `GET /api/projects`: list user projects with roles
  - `POST /api/projects`: create project, assigns owner role, records audit log
  - `GET /api/projects/[id]`: get project by ID (role: viewer)
  - `PATCH /api/projects/[id]`: update project name (role: editor), records audit log
  - `DELETE /api/projects/[id]`: delete project (role: owner, requireRecentAuth: true), records audit log
  - `GET /api/projects/[id]/members`: list project members (role: viewer)
  - `POST /api/projects/[id]/members`: add member by email (role: owner), records audit log
  - `PATCH /api/projects/[id]/members`: update member role (role: owner), records audit log
  - `DELETE /api/projects/[id]/members`: remove member (role: owner or self, requireRecentAuth: true), records audit log
  - `GET /api/projects/[id]/workflows`: list workflows with last run status (role: viewer)
  - `POST /api/projects/[id]/workflows`: create workflow (role: editor), records audit log
  - `GET /api/workflows/[id]`: get workflow (viewer)
  - `PATCH /api/workflows/[id]`: update workflow (editor), records audit log
  - `DELETE /api/workflows/[id]`: delete workflow (editor), records audit log
  - `POST /api/workflows/[id]/duplicate`: duplicate workflow with nodes and connections (editor), records audit log
  - `GET /api/projects/[id]/audit`: cursor-paginated audit trail (owner only)
- Authenticated App Shell & UI Pages:
  - App Shell Layout (`apps/web/src/app/(app)/layout.tsx`): authenticated shell with desktop sidebar, top bar, and slide-over mobile drawer (< 768px). Verified usable on 375px mobile viewports.
  - Theme Toggle (`apps/web/src/components/layout/ThemeToggle.tsx`): dark / light / system modes.
  - Sidebar & Header (`apps/web/src/components/layout/AppSidebar.tsx`, `AppHeader.tsx`, `MobileDrawer.tsx`): breadcrumb navigation, project context links, user profile, sign out.
  - Projects Page (`apps/web/src/app/(app)/projects/page.tsx`): project cards, role badges (`owner`, `editor`, `viewer`), creation date, create project modal.
  - Workflows List Page (`apps/web/src/app/(app)/projects/[id]/workflows/page.tsx` & `WorkflowModals.tsx`): workflows table, status badges (`draft`, `active`), last execution status, actions menu (open editor, rename modal, duplicate, delete with confirmation).
  - Project Settings Page (`apps/web/src/app/(app)/projects/[id]/settings/page.tsx`, `MembersManager.tsx`, `AuditLogViewer.tsx`): general settings (rename), team members management, owner audit trail with pagination, danger zone delete project with name confirmation and `ReauthModal` step-up integration.
- Tests & Verification:
  - `tests/helpers/phase3Helpers.ts`: test user registration, request builder, project and workflow setup helper.
  - `tests/integration/phase3_projects_workflows.test.ts`: 5 comprehensive integration tests covering complete IDOR matrix, viewer vs editor vs owner RBAC matrix, workflow duplication with node/connection cloning, member management with sole-owner defense, audit log verification, and project deletion.
  - All 26/26 tests passing across 4 integration suites.
  - Next.js production build cleanly compiles 31 routes.

### Known Issues / Not Done

- None.

---

## Phase 4 — Credential manager + Variables

### Plan (<= 15 lines)

1. Implement crypto.ts (AES-256-GCM, random 12-byte IV, AAD = credentialId, key rotation by version).
2. Write crypto unit tests (roundtrip, tamper detection, wrong AAD, unique IVs, key rotation).
3. Implement credential types/schemas, masking logic (maskSecret), and secret payload validators.
4. Expand credentials.ts repository (CRUD, replace secret, dependencies lookup, usedByCount, project isolation).
5. Implement credential test runners in credentialTesters.ts (Telegram, Gemini, HTTP, etc. with safe redaction).
6. Implement credentials API routes: GET/POST /api/credentials, GET/PATCH/DELETE /api/credentials/[id], GET /api/credentials/[id]/dependencies, POST /api/credentials/[id]/test.
7. Expand variables.ts repository (global/project/workflow scope CRUD, key format check, project isolation).
8. Implement variables API routes: GET/POST /api/variables, PATCH/DELETE /api/variables/[id].
9. Build UI for Credentials: /projects/[id]/credentials (list, type forms, masked hints, replace, test, delete + re-auth modal).
10. Build UI for Variables: /projects/[id]/variables (scoped tabs: global, project, workflow; JSON object editor; search).
11. Build integration test suite: Section 13 tests, JSON snapshot test (0 secrets in responses), 409 dependency rejection, variables CRUD & IDOR.
12. Run Phase 4 gate (pnpm verify), update docs/PROGRESS.md and docs/DECISIONS.md, and generate Phase 4 report.

### Status

- GREEN

### Built

- Crypto Subsystem (`apps/web/src/server/security/crypto.ts`):
  - AES-256-GCM authenticated encryption with random 12-byte IV per encryption operation.
  - Additional Authenticated Data (AAD) bound to `credentialId` to cryptographically prevent ciphertext transplantation between records.
  - Multi-version key rotation support (`CREDENTIAL_ENCRYPTION_KEY` as v1, `CREDENTIAL_ENCRYPTION_KEY_V2` as v2, with backward compatibility).
  - Rejection of tampered ciphertexts, altered auth tags, and unauthenticated/unsupported key versions.
  - Unit tests (`apps/web/tests/crypto.test.ts`): 7 tests covering roundtrip, unique IVs, tamper detection, wrong AAD rejection, and key rotation.
- Credential Schemas & Types (`apps/web/src/server/repositories/credentialSchemas.ts`):
  - Supported credential types: `telegramBot`, `geminiApiKey`, `whatsappCloud`, `metaPage`, `googleOAuth`, `httpBearer`, `httpBasic`, `httpHeader`.
  - Type-safe secret schemas validating required fields before encryption.
  - `maskSecret`: Masks sensitive tokens displaying first 4 and last 4 characters separated by `...` (or `••••` for very short secrets).
  - Masked hint generation for UI display without exposing actual secret values.
- Credential Repository (`apps/web/src/server/repositories/credentials.ts`):
  - CRUD operations with strict project isolation and role verification (`editor` or `owner`).
  - Secret immutability: creation encrypts and stores payload; PATCH updates only metadata (`name`, `description`); `replaceCredentialSecret` is a dedicated method for updating secrets.
  - `getCredentialDependencies`: Queries workflows and nodes referencing the credential.
  - `deleteCredential`: Rejects with 409 `CREDENTIAL_IN_USE` if `used_by_count > 0` or referenced by any active/draft workflow node.
  - Internal `getDecryptedCredentialPayload`: Server-side decryption for execution engine and testers; never exposed to API endpoints.
- Credential Testers (`apps/web/src/server/services/credentialTesters.ts`):
  - Safe connection test runners for `telegramBot`, `geminiApiKey`, `whatsappCloud`, `metaPage`, and `googleOAuth`.
  - Enforces 10-second timeout on external checks and applies `redact()` to all incoming/outgoing log entries.
- Credential API Routes:
  - `GET /api/credentials?projectId=...`: Lists project credentials with masked hints and `usedByCount`.
  - `POST /api/credentials`: Validates payload, encrypts with AAD, saves credential, requires recent authentication (`requireRecentAuth: true`), logs audit trail.
  - `GET /api/credentials/[id]`: Returns credential metadata and masked hint (zero secrets leaked).
  - `PATCH /api/credentials/[id]`: Updates name/description.
  - `DELETE /api/credentials/[id]`: Requires recent auth, enforces 409 `CREDENTIAL_IN_USE` dependency check, logs audit trail.
  - `GET /api/credentials/[id]/dependencies`: Returns workflows and nodes using this credential.
  - `POST /api/credentials/[id]/test`: Tests credential connectivity, rate limited to 10 requests/minute per credential.
- Variables Subsystem (`apps/web/src/server/repositories/variables.ts` & API Routes):
  - Scopes: `global` (system-wide, restricted to owners), `project` (project-scoped), and `workflow` (workflow-scoped).
  - Key name validation: Strictly enforces identifier pattern `^[A-Za-z_][A-Za-z0-9_]*$`.
  - Serialization: Supports primitive values (string, number, boolean) and structured JSON objects/arrays.
  - `GET /api/variables?projectId=...`: Lists variables across scopes.
  - `POST /api/variables`: Creates variable with key format validation, duplicate key rejection, and audit logging.
  - `PATCH /api/variables/[id]`: Updates variable value and description with audit logging.
  - `DELETE /api/variables/[id]`: Deletes variable with audit logging.
- Web UI for Credentials & Variables:
  - `/projects/[id]/credentials` page:
    - Lists credentials with masked hint badges, types, creation dates, and usage counts.
    - Test connection button with loading states and real-time success/error alerts.
    - Create credential modal with type-specific form fields and descriptions.
    - Replace credential secret modal with re-auth step-up dialog.
    - Delete credential modal with dependency warning and 409 conflict handling.
  - `/projects/[id]/variables` page:
    - Scope tabs (`Project`, `Workflow`, `Global`) and live key/value search filter.
    - JSON-formatted value preview with type badges (`string`, `number`, `boolean`, `json`).
    - Create variable modal with regex key validation and JSON format validator.
    - Edit variable modal with type-aware input editor.
    - Delete variable modal with confirmation.
- Integration Test Suites:
  - `tests/integration/phase4_credentials.test.ts`:
    - Full CRUD with DB encryption and masked hint verification.
    - Snapshot test strictly validating zero secrets or encryption keys leaked across any response.
    - Re-auth gating enforcement on sensitive endpoints.
    - 409 `CREDENTIAL_IN_USE` rejection on node-bound credentials.
    - Connection test endpoint rate limiting (10/min).
  - `tests/integration/phase4_variables.test.ts`:
    - Scoped variables CRUD (project, workflow, global).
    - Identifier naming regex validation.
    - Rich JSON value storage and retrieval.
    - Cross-project IDOR and role enforcement.
  - Test runner hardening: Vitest configured with `fileParallelism: false` and unique per-request IP partitioning for reliable concurrency against Supabase.
- Full Verification:
  - 8/8 unit test files passed (23/23 tests).
  - 6/6 integration test files passed (32/32 tests).
  - Secret scanner clean: zero secrets in repo.
  - Next.js production build succeeded with 39 routes generated.

### Known Issues / Not Done

- None.

### Deviations From Spec

- None.
