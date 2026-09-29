export const runtime = 'nodejs';

import { NextResponse } from 'next/server';
import { getDb } from '@/server/db/client';

export async function GET() {
  let dbOk = false;

  try {
    const sql = getDb();
    await sql`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  return NextResponse.json({
    ok: true,
    db: dbOk,
    version: '0.1.0',
  });
}
