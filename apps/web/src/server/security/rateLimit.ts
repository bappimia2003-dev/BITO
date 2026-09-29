import { BitoError } from '@bito/shared';
import { getDb } from '../db/client.js';

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSec?: number;
}

export async function incrementRateLimit(
  key: string,
  limit: number,
  windowSec: number = 60
): Promise<RateLimitResult> {
  const sql = getDb();
  const windowMs = windowSec * 1000;
  const now = Date.now();
  const bucketTime = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(bucketTime);

  const rows = await sql<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = rate_limits.count + 1
    RETURNING count
  `;

  const count = rows[0]?.count ?? 1;
  const allowed = count <= limit;
  const retryAfterSec = allowed
    ? undefined
    : Math.max(1, Math.ceil((bucketTime + windowMs - now) / 1000));

  return {
    allowed,
    count,
    limit,
    ...(retryAfterSec !== undefined ? { retryAfterSec } : {}),
  };
}

export async function assertRateLimit(
  key: string,
  limit: number,
  windowSec: number = 60
): Promise<RateLimitResult> {
  const result = await incrementRateLimit(key, limit, windowSec);
  if (!result.allowed) {
    throw BitoError('RATE_LIMITED', 'Too many requests. Please try again later.', {
      httpStatus: 429,
      retryable: true,
      details: {
        key,
        limit,
        count: result.count,
        retryAfterSec: result.retryAfterSec,
      },
    });
  }
  return result;
}
