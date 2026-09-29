import { z } from 'zod';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

export const executionSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  versionId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: z.enum(['QUEUED', 'RUNNING', 'WAITING', 'SUCCESS', 'FAILED', 'CANCELLED']),
  mode: z.enum(['trigger', 'manual', 'schedule', 'retry']),
  triggerNodeId: z.string().uuid().nullable().optional(),
  triggerPayload: z.unknown().nullable().optional(),
  vars: z.record(z.unknown()).default({}),
  error: z.unknown().nullable().optional(),
  nodeRunCount: z.number().int().default(0),
  createdAt: z.string(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
});

export type Execution = z.infer<typeof executionSchema>;

export async function listExecutions(
  actor: Actor,
  projectId: string,
  workflowId?: string,
  cursor?: string,
  limit: number = 50
): Promise<Execution[]> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const clampedLimit = Math.min(Math.max(1, limit), 100);

  const rows = await sql`
    SELECT id, workflow_id, version_id, project_id, status, mode, trigger_node_id, trigger_payload, vars, error, node_run_count, created_at, started_at, finished_at
    FROM executions
    WHERE project_id = ${projectId}
      ${workflowId ? sql`AND workflow_id = ${workflowId}` : sql``}
      ${cursor ? sql`AND id < ${cursor}` : sql``}
    ORDER BY created_at DESC
    LIMIT ${clampedLimit}
  `;
  return rows.map((r) => parseRow(executionSchema, r));
}
