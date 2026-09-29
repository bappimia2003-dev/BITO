import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { runMigrations } from '../../scripts/migrate.js';
import { incrementRateLimit } from '../../apps/web/src/server/security/rateLimit.js';

describe('Phase 1 Database & Repository Foundation Integration Tests', () => {
  let sql: Sql;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, {
      prepare: false,
      ssl: 'require',
      max: 5,
    });
  });

  afterAll(async () => {
    if (sql) {
      await sql.end({ timeout: 5 });
    }
  });

  it('1. Migrations apply idempotently and re-running is a no-op', async () => {
    // Re-running migrations should complete with 0 errors
    await expect(runMigrations()).resolves.not.toThrow();

    // Verify all 8 migrations are recorded in schema_migrations
    const applied = await sql<{ version: string }[]>`
      SELECT version FROM schema_migrations ORDER BY version ASC
    `;
    const versions = applied.map((r) => r.version);
    expect(versions).toContain('0001_extensions.sql');
    expect(versions).toContain('0002_auth.sql');
    expect(versions).toContain('0003_projects_workflows.sql');
    expect(versions).toContain('0004_credentials_variables.sql');
    expect(versions).toContain('0005_execution.sql');
    expect(versions).toContain('0006_files_data.sql');
    expect(versions).toContain('0007_webhooks_schedules.sql');
    expect(versions).toContain('0008_security.sql');
  });

  it('2. RLS is enabled on all public tables in PostgreSQL', async () => {
    const tables = await sql<{ tablename: string; rowsecurity: boolean }[]>`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' AND tablename != 'schema_migrations'
    `;

    expect(tables.length).toBeGreaterThanOrEqual(15);
    for (const table of tables) {
      expect(
        table.rowsecurity,
        `Table ${table.tablename} must have Row Level Security enabled`
      ).toBe(true);
    }
  });

  it('3. audit_logs table is append-only (UPDATE and DELETE are blocked by trigger)', async () => {
    // Insert a test audit log
    const [inserted] = await sql<{ id: string }[]>`
      INSERT INTO audit_logs (action, meta)
      VALUES ('test.insert', '{"sample": "data"}'::jsonb)
      RETURNING id
    `;
    expect(inserted).toBeDefined();
    const logId = inserted!.id;

    // UPDATE should throw 'audit_logs is append-only'
    await expect(
      sql`UPDATE audit_logs SET action = 'tampered' WHERE id = ${logId}`
    ).rejects.toThrow(/audit_logs is append-only/);

    // DELETE should throw 'audit_logs is append-only'
    await expect(sql`DELETE FROM audit_logs WHERE id = ${logId}`).rejects.toThrow(
      /audit_logs is append-only/
    );
  });

  it('4. FK, unique, and check constraints are strictly enforced', async () => {
    // FK check: workflow referencing a non-existent project_id
    const nonExistentProjectId = '00000000-0000-0000-0000-000000000000';
    await expect(
      sql`
        INSERT INTO workflows (project_id, name)
        VALUES (${nonExistentProjectId}, 'Invalid Workflow')
      `
    ).rejects.toThrow(/foreign key constraint/i);

    // Create a real user and project for constraint tests
    const [user] = await sql<{ id: string }[]>`
      INSERT INTO users (email, display_name)
      VALUES (${`test_${Date.now()}@example.com`}, 'Test User')
      RETURNING id
    `;
    const [project] = await sql<{ id: string }[]>`
      INSERT INTO projects (name, owner_id)
      VALUES ('Constraint Test Project', ${user!.id})
      RETURNING id
    `;
    const [workflow] = await sql<{ id: string }[]>`
      INSERT INTO workflows (project_id, name)
      VALUES (${project!.id}, 'Workflow 1')
      RETURNING id
    `;

    // Check constraint: Node key must match '^[a-z][a-z0-9_]{0,39}$'
    await expect(
      sql`
        INSERT INTO nodes (workflow_id, key, type, name)
        VALUES (${workflow!.id}, 'INVALID-KEY-UPPERCASE', 'test.node', 'Invalid Node')
      `
    ).rejects.toThrow(/violates check constraint/i);

    // Valid node key insert
    await sql`
      INSERT INTO nodes (workflow_id, key, type, name)
      VALUES (${workflow!.id}, 'valid_key_1', 'test.node', 'Valid Node')
    `;

    // Unique constraint: Duplicate node key in the same workflow
    await expect(
      sql`
        INSERT INTO nodes (workflow_id, key, type, name)
        VALUES (${workflow!.id}, 'valid_key_1', 'test.node', 'Duplicate Key Node')
      `
    ).rejects.toThrow(/violates unique constraint/i);

    // Check constraint: Variables scope validation
    await expect(
      sql`
        INSERT INTO variables (scope, key, value)
        VALUES ('project', 'TEST_VAR', '"value"'::jsonb)
      `
    ).rejects.toThrow(/violates check constraint/i);
  });

  it('5. Rate-limit upsert counts correctly under 20 concurrent calls', async () => {
    const testKey = `concurrent_test_${Date.now()}`;
    const limit = 100;

    // Fire 20 parallel increment calls simultaneously
    const calls = Array.from({ length: 20 }, () => incrementRateLimit(testKey, limit, 60));
    const results = await Promise.all(calls);

    expect(results).toHaveLength(20);
    // Every call should be allowed
    results.forEach((r) => expect(r.allowed).toBe(true));

    // Verify the latest count returned is 20
    const counts = results.map((r) => r.count);
    expect(Math.max(...counts)).toBe(20);

    // Verify DB count directly
    const [row] = await sql<{ count: number }[]>`
      SELECT count FROM rate_limits WHERE key = ${testKey}
    `;
    expect(row?.count).toBe(20);
  });
});
