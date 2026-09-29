import { z } from 'zod';
import { getDb } from '../db/client.js';
import { parseRow } from './base.js';

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(1),
  passwordHash: z.string().nullable().optional(),
  isDisabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type User = z.infer<typeof userSchema>;

export async function findUserById(id: string): Promise<User | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, display_name, password_hash, is_disabled, created_at, updated_at
    FROM users
    WHERE id = ${id}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return parseRow(userSchema, row);
}

export async function findUserByEmail(email: string): Promise<User | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, email, display_name, password_hash, is_disabled, created_at, updated_at
    FROM users
    WHERE email = ${email.toLowerCase().trim()}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return parseRow(userSchema, row);
}

export async function createUser(data: {
  email: string;
  displayName: string;
  passwordHash?: string | null;
}): Promise<User> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO users (email, display_name, password_hash)
    VALUES (${data.email.toLowerCase().trim()}, ${data.displayName}, ${data.passwordHash ?? null})
    RETURNING id, email, display_name, password_hash, is_disabled, created_at, updated_at
  `;
  const row = rows[0];
  if (!row) throw new Error('Failed to create user');
  return parseRow(userSchema, row);
}

export async function countUsers(): Promise<number> {
  const sql = getDb();
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM users
  `;
  return Number(rows[0]?.count ?? 0);
}

export async function updateUserPassword(
  userId: string,
  passwordHash: string | null
): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE users
    SET password_hash = ${passwordHash},
        updated_at = NOW()
    WHERE id = ${userId}
  `;
}
