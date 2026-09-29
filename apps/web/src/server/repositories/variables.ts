import { z } from 'zod';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

export const variableSchema = z.object({
  id: z.string().uuid(),
  scope: z.enum(['global', 'project', 'workflow']),
  ownerId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  workflowId: z.string().uuid().nullable().optional(),
  key: z.string(),
  value: z.unknown(),
  updatedAt: z.string(),
});

export type VariableRecord = z.infer<typeof variableSchema>;

export async function listProjectVariables(
  actor: Actor,
  projectId: string
): Promise<VariableRecord[]> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const rows = await sql`
    SELECT id, scope, owner_id, project_id, workflow_id, key, value, updated_at
    FROM variables
    WHERE project_id = ${projectId} AND scope = 'project'
    ORDER BY key ASC
  `;
  return rows.map((r) => parseRow(variableSchema, r));
}
