import { BitoError } from '@bito/shared';
import { getDb } from '../db/client.js';
import { incrementRateLimit } from '../security/rateLimit.js';
import { writeAuditLog } from '../repositories/audit.js';

const LOGIN_WINDOW_SEC = 15 * 60; // 15 minutes
const MAX_FAILED_ATTEMPTS = 5;

export function getThrottleKey(email: string, ip: string): string {
  return `login_fail:${email.toLowerCase().trim()}:${ip.trim()}`;
}

export async function assertLoginNotThrottled(email: string, ip: string): Promise<void> {
  const sql = getDb();
  const key = getThrottleKey(email, ip);
  const windowMs = LOGIN_WINDOW_SEC * 1000;
  const now = Date.now();
  const bucketTime = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(bucketTime);

  const rows = await sql<{ count: number }[]>`
    SELECT count FROM rate_limits
    WHERE key = ${key}
      AND window_start = ${windowStart}
    LIMIT 1
  `;

  const count = rows[0]?.count ?? 0;
  if (count >= MAX_FAILED_ATTEMPTS) {
    const retryAfterSec = Math.max(1, Math.ceil((bucketTime + windowMs - now) / 1000));
    throw BitoError(
      'RATE_LIMITED',
      'Too many failed login attempts. Please try again in 15 minutes.',
      {
        httpStatus: 429,
        retryable: true,
        details: { count, limit: MAX_FAILED_ATTEMPTS, retryAfterSec },
      }
    );
  }
}

export async function recordFailedLogin(
  email: string,
  ip: string,
  userAgent?: string
): Promise<void> {
  const key = getThrottleKey(email, ip);
  await incrementRateLimit(key, MAX_FAILED_ATTEMPTS, LOGIN_WINDOW_SEC);

  await writeAuditLog({
    action: 'auth.login_failed',
    targetType: 'user_auth',
    targetId: email.toLowerCase().trim(),
    ip,
    userAgent,
    meta: { email: email.toLowerCase().trim() },
  });
}

export async function clearFailedLogins(email: string, ip: string): Promise<void> {
  const sql = getDb();
  const key = getThrottleKey(email, ip);
  await sql`
    DELETE FROM rate_limits
    WHERE key = ${key}
  `;
}
