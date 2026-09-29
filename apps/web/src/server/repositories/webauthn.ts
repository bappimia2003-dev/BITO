import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { getDb } from '../db/client.js';
import { parseRow } from './base.js';

export const webAuthnCredentialSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  credentialId: z.string(),
  publicKey: z.instanceof(Buffer).or(z.instanceof(Uint8Array)),
  counter: z.coerce.number(),
  transports: z.array(z.string()).default([]),
  deviceName: z.string().nullable().optional(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable().optional(),
});

export type WebAuthnCredentialRow = z.infer<typeof webAuthnCredentialSchema>;

export const webAuthnChallengeSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid().nullable().optional(),
  pendingEmail: z.string().nullable().optional(),
  pendingDisplayName: z.string().nullable().optional(),
  challenge: z.string(),
  purpose: z.enum(['register', 'login', 'reauth']),
  expiresAt: z.string(),
  createdAt: z.string(),
});

export type WebAuthnChallengeRow = z.infer<typeof webAuthnChallengeSchema>;

export async function createWebAuthnChallenge(data: {
  challenge: string;
  purpose: 'register' | 'login' | 'reauth';
  userId?: string | null;
  pendingEmail?: string | null;
  pendingDisplayName?: string | null;
  ttlSeconds?: number;
}): Promise<WebAuthnChallengeRow> {
  const sql = getDb();
  const ttl = data.ttlSeconds ?? 300; // 5 minutes

  const rows = await sql`
    INSERT INTO webauthn_challenges (
      challenge, purpose, user_id, pending_email, pending_display_name, expires_at
    )
    VALUES (
      ${data.challenge},
      ${data.purpose},
      ${data.userId ?? null},
      ${data.pendingEmail ? data.pendingEmail.toLowerCase().trim() : null},
      ${data.pendingDisplayName ?? null},
      NOW() + (${ttl} * interval '1 second')
    )
    RETURNING id, user_id, pending_email, pending_display_name, challenge, purpose, expires_at, created_at
  `;

  const row = rows[0];
  if (!row) throw new Error('Failed to create WebAuthn challenge');
  return parseRow(webAuthnChallengeSchema, row);
}

/**
 * Validates, consumes (single-use delete), and returns a challenge.
 * Throws 400 if expired or not found.
 */
export async function consumeWebAuthnChallenge(
  challenge: string,
  purpose: 'register' | 'login' | 'reauth'
): Promise<WebAuthnChallengeRow> {
  const sql = getDb();

  // Atomically select and delete
  const rows = await sql`
    DELETE FROM webauthn_challenges
    WHERE challenge = ${challenge}
      AND purpose = ${purpose}
      AND expires_at > NOW()
    RETURNING id, user_id, pending_email, pending_display_name, challenge, purpose, expires_at, created_at
  `;

  const row = rows[0];
  if (!row) {
    throw BitoError(
      'VALIDATION_FAILED',
      'WebAuthn challenge is invalid, expired, or already used',
      {
        httpStatus: 400,
      }
    );
  }

  return parseRow(webAuthnChallengeSchema, row);
}

export async function findCredentialByCredentialId(
  credentialId: string
): Promise<WebAuthnCredentialRow | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, user_id, credential_id, public_key, counter, transports, device_name, created_at, last_used_at
    FROM webauthn_credentials
    WHERE credential_id = ${credentialId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return parseRow(webAuthnCredentialSchema, row);
}

export async function listCredentialsForUser(userId: string): Promise<WebAuthnCredentialRow[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, user_id, credential_id, public_key, counter, transports, device_name, created_at, last_used_at
    FROM webauthn_credentials
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `;
  return rows.map((r) => parseRow(webAuthnCredentialSchema, r));
}

export async function createCredential(data: {
  userId: string;
  credentialId: string;
  publicKey: Uint8Array | Buffer;
  counter: number | bigint;
  transports?: string[];
  deviceName?: string | null;
}): Promise<WebAuthnCredentialRow> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO webauthn_credentials (
      user_id, credential_id, public_key, counter, transports, device_name
    )
    VALUES (
      ${data.userId},
      ${data.credentialId},
      ${Buffer.from(data.publicKey)},
      ${Number(data.counter)},
      ${data.transports ?? []},
      ${data.deviceName ?? null}
    )
    RETURNING id, user_id, credential_id, public_key, counter, transports, device_name, created_at, last_used_at
  `;

  const row = rows[0];
  if (!row) throw new Error('Failed to create WebAuthn credential');
  return parseRow(webAuthnCredentialSchema, row);
}

export async function updateCredentialCounter(
  credentialId: string,
  counter: number | bigint
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE webauthn_credentials
    SET counter = ${Number(counter)},
        last_used_at = NOW()
    WHERE credential_id = ${credentialId}
  `;
}

export async function deleteCredentialById(id: string, userId: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    DELETE FROM webauthn_credentials
    WHERE id = ${id}
      AND user_id = ${userId}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function countCredentialsForUser(userId: string): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM webauthn_credentials
    WHERE user_id = ${userId}
  `;
  return Number(rows[0]?.count ?? 0);
}
