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

- IN PROGRESS
