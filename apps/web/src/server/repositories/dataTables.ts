import { z } from 'zod';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

export const dataTableSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  columns: z.array(z.unknown()).default([]),
  createdAt: z.string(),
});

export type DataTable = z.infer<typeof dataTableSchema>;

export async function listDataTables(actor: Actor, projectId: string): Promise<DataTable[]> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const rows = await sql`
    SELECT id, project_id, name, columns, created_at
    FROM data_tables
    WHERE project_id = ${projectId}
    ORDER BY name ASC
  `;
  return rows.map((r) => parseRow(dataTableSchema, r));
}
