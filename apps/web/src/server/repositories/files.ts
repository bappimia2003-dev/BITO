import { z } from 'zod';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

export const fileSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  kind: z.enum(['csv', 'xlsx', 'json']),
  mime: z.string(),
  sizeBytes: z.coerce.number(),
  sha256: z.string(),
  storagePath: z.string(),
  meta: z.record(z.unknown()).default({}),
  mappings: z.array(z.unknown()).default([]),
  version: z.number().int().default(1),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  deletedAt: z.string().nullable().optional(),
});

export type FileRecord = z.infer<typeof fileSchema>;

export async function listFiles(actor: Actor, projectId: string): Promise<FileRecord[]> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const rows = await sql`
    SELECT id, project_id, name, kind, mime, size_bytes, sha256, storage_path, meta, mappings, version, created_by, created_at, deleted_at
    FROM files
    WHERE project_id = ${projectId} AND deleted_at IS NULL
    ORDER BY created_at DESC
  `;
  return rows.map((r) => parseRow(fileSchema, r));
}
