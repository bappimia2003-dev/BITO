import { z } from 'zod';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

export const workflowSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(''),
  status: z.enum(['draft', 'active', 'archived']),
  activeVersionId: z.string().uuid().nullable().optional(),
  revision: z.number().int().default(1),
  settings: z.record(z.unknown()).default({}),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Workflow = z.infer<typeof workflowSchema>;

export async function listWorkflows(actor: Actor, projectId: string): Promise<Workflow[]> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const rows = await sql`
    SELECT id, project_id, name, description, status, active_version_id, revision, settings, created_by, created_at, updated_at
    FROM workflows
    WHERE project_id = ${projectId}
    ORDER BY updated_at DESC
  `;
  return rows.map((r) => parseRow(workflowSchema, r));
}

export async function getWorkflow(
  actor: Actor,
  projectId: string,
  workflowId: string
): Promise<Workflow | null> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const rows = await sql`
    SELECT id, project_id, name, description, status, active_version_id, revision, settings, created_by, created_at, updated_at
    FROM workflows
    WHERE id = ${workflowId} AND project_id = ${projectId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return parseRow(workflowSchema, row);
}

export async function createWorkflow(
  actor: Actor,
  projectId: string,
  data: {
    name: string;
    description?: string;
    settings?: Record<string, unknown>;
  }
): Promise<Workflow> {
  await assertProjectRole(actor, projectId, 'editor');
  const sql = getDb();
  const rows = await sql`
    INSERT INTO workflows (project_id, name, description, settings, created_by)
    VALUES (
      ${projectId},
      ${data.name},
      ${data.description ?? ''},
      ${JSON.stringify(data.settings ?? {})}::jsonb,
      ${actor.userId}
    )
    RETURNING id, project_id, name, description, status, active_version_id, revision, settings, created_by, created_at, updated_at
  `;
  const row = rows[0];
  if (!row) throw new Error('Failed to create workflow');
  return parseRow(workflowSchema, row);
}

export async function deleteWorkflow(
  actor: Actor,
  projectId: string,
  workflowId: string
): Promise<void> {
  await assertProjectRole(actor, projectId, 'editor');
  const sql = getDb();
  await sql`
    DELETE FROM workflows
    WHERE id = ${workflowId} AND project_id = ${projectId}
  `;
}
