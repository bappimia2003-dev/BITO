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
