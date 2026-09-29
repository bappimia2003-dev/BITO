import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { env } from '../../../../server/env.js';
import { runTick } from '../../../../server/engine-runtime/runTick.js';

export const maxDuration = 60;

export async function POST(req: NextRequest): Promise<Response> {
  const authHeader = req.headers.get('authorization') ?? '';

  if (!authHeader.startsWith('Bearer ')) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid Authorization header' } },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7);
  const expectedBuf = Buffer.from(env.CRON_SECRET, 'utf8');
  const tokenBuf = Buffer.from(token, 'utf8');

  if (expectedBuf.length !== tokenBuf.length || !crypto.timingSafeEqual(expectedBuf, tokenBuf)) {
    return Response.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid CRON_SECRET' } },
      { status: 401 }
    );
  }

  const result = await runTick({ budgetMs: env.TICK_BUDGET_MS });

  // Self-continuation if ready jobs remain
  if (result.remainingReady > 0) {
    void fetch(`${env.APP_URL}/api/engine/tick`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    }).catch(() => {
      // Fire-and-forget
    });
  }

  return Response.json({ ok: true, ...result });
}
