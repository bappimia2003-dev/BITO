import postgres, { type Sql, type TransactionSql } from 'postgres';
import { env } from '../env.js';

let globalSql: Sql | null = null;

export function getDb(): Sql {
  if (!globalSql) {
    globalSql = postgres(env.DATABASE_URL, {
      prepare: false, // Transaction pooler requirement (SPEC Section 4 & 22.4)
      ssl: 'require',
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalSql;
}

export const sql = getDb();

export type Transaction = TransactionSql;

export async function withTransaction<T>(fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  const db = getDb();
  return (await db.begin(fn as unknown as (sql: TransactionSql) => Promise<T>)) as T;
}
