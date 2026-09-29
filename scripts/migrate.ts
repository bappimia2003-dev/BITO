import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres, { type Sql } from 'postgres';

interface MigrationRow {
  version: string;
}

// Automatically load .env if available
try {
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch {
  // Ignore if .env does not exist
}

async function runMigrations(): Promise<void> {
  const dbUrl = process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  if (!dbUrl) {
    process.stderr.write('Error: Neither DATABASE_URL_MIGRATE nor DATABASE_URL is set.\n');
    process.exit(1);
  }

  const sql: Sql = postgres(dbUrl, {
    max: 1,
    prepare: false,
    ssl: 'require',
    connect_timeout: 10,
  });

  try {
    // Ensure migrations tracking table exists
    await sql`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `;

    const migrationsDir = join(process.cwd(), 'db', 'migrations');
    let files: string[] = [];
    try {
      files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
    } catch {
      process.stdout.write('No db/migrations directory found or empty. Skipping migrations.\n');
      await sql.end();
      return;
    }

    if (files.length === 0) {
      process.stdout.write('No migration files to run.\n');
      await sql.end();
      return;
    }

    const appliedRows = await sql<MigrationRow[]>`SELECT version FROM schema_migrations`;
    const appliedSet = new Set((appliedRows as unknown as MigrationRow[]).map((r) => r.version));

    for (const file of files) {
      if (appliedSet.has(file)) {
        continue;
      }

      process.stdout.write(`Applying migration: ${file}...\n`);
      const filePath = join(migrationsDir, file);
      const content = await readFile(filePath, 'utf-8');

      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`INSERT INTO schema_migrations (version) VALUES (${file})`;
      });

      process.stdout.write(`Applied: ${file}\n`);
    }

    process.stdout.write('Migrations completed successfully.\n');
  } catch (err) {
    process.stderr.write(`Migration failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations().catch((err) => {
    process.stderr.write(`Fatal migration error: ${err}\n`);
    process.exit(1);
  });
}

export { runMigrations };
