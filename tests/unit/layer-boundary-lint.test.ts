import { describe, it, expect } from 'vitest';
import { ESLint } from 'eslint';

describe('Layer Boundary Lint Rules', () => {
  const eslint = new ESLint();

  it('proves packages/engine importing next fails lint', async () => {
    const code = "import { NextResponse } from 'next/server';\nexport const x = NextResponse;\n";
    const results = await eslint.lintText(code, {
      filePath: 'packages/engine/src/bad-import-next.ts',
    });

    const hasRestrictedNext = results[0]?.messages.some(
      (m) =>
        m.ruleId === 'no-restricted-imports' && m.message.includes('engine must NOT import next')
    );
    expect(hasRestrictedNext).toBe(true);
  });

  it('proves packages/engine importing postgres fails lint', async () => {
    const code = "import postgres from 'postgres';\nexport const db = postgres;\n";
    const results = await eslint.lintText(code, {
      filePath: 'packages/engine/src/bad-import-postgres.ts',
    });

    const hasRestrictedPostgres = results[0]?.messages.some(
      (m) =>
        m.ruleId === 'no-restricted-imports' &&
        m.message.includes('engine must NOT import postgres')
    );
    expect(hasRestrictedPostgres).toBe(true);
  });

  it('allows packages/engine to import @bito/shared', async () => {
    const code = "import type { Json } from '@bito/shared';\nexport const x: Json = 'valid';\n";
    const results = await eslint.lintText(code, {
      filePath: 'packages/engine/src/valid-import.ts',
    });

    const restrictedErrors =
      results[0]?.messages.filter((m) => m.ruleId === 'no-restricted-imports') ?? [];
    expect(restrictedErrors.length).toBe(0);
  });
});
