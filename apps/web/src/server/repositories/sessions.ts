import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { parseRow } from './base.js';

export const sessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  tokenHash: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  lastAuthAt: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable().optional(),
  ip: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
});

export type Session = z.infer<typeof sessionSchema>;

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ABSOLUTE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000; // 5 minutes

export async function createSession(data: {
  userId: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ session: Session; rawToken: string }> {
  const sql = getDb();
  const rawToken = generateSessionToken();
  const tokenHash = hashSessionToken(rawToken);

  const now = Date.now();
  const expiresAt = new Date(now + IDLE_TIMEOUT_MS);

  const rows = await sql`
    INSERT INTO sessions (
      user_id, token_hash, expires_at, ip, user_agent, last_seen_at, last_auth_at
    )
    VALUES (
      ${data.userId},
      ${tokenHash},
      ${expiresAt.toISOString()},
      ${data.ip ?? null},
      ${data.userAgent ?? null},
      NOW(),
      NOW()
    )
    RETURNING id, user_id, token_hash, created_at, last_seen_at, last_auth_at, expires_at, revoked_at, ip, user_agent
  `;

  const row = rows[0];
  if (!row) throw new Error('Failed to create session');

  return {
    session: parseRow(sessionSchema, row),
    rawToken,
  };
}

export async function findActiveSessionByToken(token: string): Promise<Session | null> {
  const sql = getDb();
  const tokenHash = hashSessionToken(token);

  const rows = await sql`
    SELECT id, user_id, token_hash, created_at, last_seen_at, last_auth_at, expires_at, revoked_at, ip, user_agent
    FROM sessions
    WHERE token_hash = ${tokenHash}
      AND revoked_at IS NULL
      AND expires_at > NOW()
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) return null;

  const session = parseRow(sessionSchema, row);

  // Check 30-day absolute timeout from created_at
  const createdAtMs = new Date(session.createdAt).getTime();
  if (Date.now() - createdAtMs > ABSOLUTE_TIMEOUT_MS) {
    // Session exceeded absolute timeout, revoke it
    await sql`
      UPDATE sessions
      SET revoked_at = NOW()
      WHERE id = ${session.id}
    `;
    return null;
  }

  // Sliding idle timeout: update last_seen_at and expires_at at most once every 5 minutes
  const lastSeenMs = new Date(session.lastSeenAt).getTime();
  if (Date.now() - lastSeenMs >= LAST_SEEN_THROTTLE_MS) {
    const newExpiresAtMs = Math.min(
      Date.now() + IDLE_TIMEOUT_MS,
      createdAtMs + ABSOLUTE_TIMEOUT_MS
    );
    const newExpiresAt = new Date(newExpiresAtMs).toISOString();

    await sql`
      UPDATE sessions
      SET last_seen_at = NOW(),
          expires_at = ${newExpiresAt}
      WHERE id = ${session.id}
    `;
    session.lastSeenAt = new Date().toISOString();
    session.expiresAt = newExpiresAt;
  }

  return session;
}

export async function updateSessionLastAuth(sessionId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE sessions
    SET last_auth_at = NOW()
    WHERE id = ${sessionId}
  `;
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const sql = getDb();
  const tokenHash = hashSessionToken(token);
  await sql`
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE token_hash = ${tokenHash}
  `;
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE sessions
    SET revoked_at = NOW()
    WHERE user_id = ${userId}
      AND revoked_at IS NULL
  `;
}
