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
