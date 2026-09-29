export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import postgres from 'postgres';

export async function GET() {
  let dbOk = false;

  // DB check may report db:false until Phase 1 — then must be true (SPEC Phase 0 Gate)
  if (process.env.DATABASE_URL) {
    try {
      const sql = postgres(process.env.DATABASE_URL, {
        max: 1,
        connect_timeout: 2,
        prepare: false,
      });
      await sql`SELECT 1`;
      await sql.end({ timeout: 1 });
      dbOk = true;
    } catch {
      dbOk = false;
    }
  }

  return NextResponse.json({
    ok: true,
    db: dbOk,
    version: '0.1.0',
  });
}
