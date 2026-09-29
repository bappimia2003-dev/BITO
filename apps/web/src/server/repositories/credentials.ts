import { z } from 'zod';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

export const credentialSummarySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: z.string(),
  name: z.string(),
  keyVersion: z.number().int(),
  hint: z.record(z.unknown()),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type CredentialSummary = z.infer<typeof credentialSummarySchema>;

export async function listCredentials(
  actor: Actor,
  projectId: string
): Promise<CredentialSummary[]> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  // NEVER SELECT ciphertext, iv, auth_tag to the frontend (SPEC Section 13.3)
  const rows = await sql`
    SELECT id, project_id, type, name, key_version, hint, created_by, created_at, updated_at
    FROM credentials
    WHERE project_id = ${projectId}
    ORDER BY name ASC
  `;
  return rows.map((r) => parseRow(credentialSummarySchema, r));
}
