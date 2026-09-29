import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

const jsonRecordSchema = z.preprocess((val) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return {};
    }
  }
  return val ?? {};
}, z.record(z.unknown()).default({}));

export const workflowSchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().default(''),
  status: z.enum(['draft', 'active', 'archived']),
  activeVersionId: z.string().uuid().nullable().optional(),
  revision: z.number().int().default(1),
  settings: jsonRecordSchema,
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastExecutionStatus: z.string().nullable().optional(),
});

export type Workflow = z.infer<typeof workflowSchema>;

export async function listWorkflows(actor: Actor, projectId: string): Promise<Workflow[]> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const rows = await sql`
    SELECT 
      w.id, 
      w.project_id, 
      w.name, 
      w.description, 
      w.status, 
      w.active_version_id, 
      w.revision, 
      w.settings, 
      w.created_by, 
      w.created_at, 
      w.updated_at,
      (
        SELECT e.status 
        FROM executions e 
        WHERE e.workflow_id = w.id 
        ORDER BY e.created_at DESC 
        LIMIT 1
      ) as last_execution_status
    FROM workflows w
    WHERE w.project_id = ${projectId}
    ORDER BY w.updated_at DESC
  `;
  return rows.map((r) => parseRow(workflowSchema, r));
}

export async function findWorkflowById(actor: Actor, workflowId: string): Promise<Workflow> {
  const sql = getDb();
  const rows = await sql`
    SELECT 
      w.id, 
      w.project_id, 
      w.name, 
      w.description, 
      w.status, 
      w.active_version_id, 
      w.revision, 
      w.settings, 
      w.created_by, 
      w.created_at, 
      w.updated_at,
      (
        SELECT e.status 
        FROM executions e 
        WHERE e.workflow_id = w.id 
        ORDER BY e.created_at DESC 
        LIMIT 1
      ) as last_execution_status
    FROM workflows w
    WHERE w.id = ${workflowId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    throw BitoError('NOT_FOUND', 'Workflow not found', { httpStatus: 404 });
  }
  const workflow = parseRow(workflowSchema, row);
  await assertProjectRole(actor, workflow.projectId, 'viewer');
  return workflow;
}

export async function getWorkflow(
  actor: Actor,
  projectId: string,
  workflowId: string
): Promise<Workflow | null> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const rows = await sql`
    SELECT 
      w.id, 
      w.project_id, 
      w.name, 
      w.description, 
      w.status, 
      w.active_version_id, 
      w.revision, 
      w.settings, 
      w.created_by, 
      w.created_at, 
      w.updated_at,
      (
        SELECT e.status 
        FROM executions e 
        WHERE e.workflow_id = w.id 
        ORDER BY e.created_at DESC 
        LIMIT 1
      ) as last_execution_status
    FROM workflows w
    WHERE w.id = ${workflowId} AND w.project_id = ${projectId}
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
  if (!row) throw BitoError('INTERNAL_ERROR', 'Failed to create workflow', { httpStatus: 500 });
  return parseRow(workflowSchema, row);
}

export async function updateWorkflow(
  actor: Actor,
  workflowId: string,
  data: {
    name?: string;
    description?: string;
    settings?: Record<string, unknown>;
    status?: 'draft' | 'active' | 'archived';
  }
): Promise<Workflow> {
  const existing = await findWorkflowById(actor, workflowId);
  await assertProjectRole(actor, existing.projectId, 'editor');

  const sql = getDb();
  const rows = await sql`
    UPDATE workflows
    SET 
      name = COALESCE(${data.name ?? null}, name),
      description = COALESCE(${data.description ?? null}, description),
      settings = CASE 
        WHEN ${data.settings !== undefined} THEN ${JSON.stringify(data.settings ?? {})}::jsonb 
        ELSE settings 
      END,
      status = COALESCE(${data.status ?? null}, status),
      revision = revision + 1,
      updated_at = NOW()
    WHERE id = ${workflowId}
    RETURNING id, project_id, name, description, status, active_version_id, revision, settings, created_by, created_at, updated_at
  `;
  const row = rows[0];
  if (!row) throw BitoError('NOT_FOUND', 'Workflow not found', { httpStatus: 404 });
  return parseRow(workflowSchema, row);
}

export async function duplicateWorkflow(actor: Actor, workflowId: string): Promise<Workflow> {
  const original = await findWorkflowById(actor, workflowId);
  await assertProjectRole(actor, original.projectId, 'editor');

  const sql = getDb();
  return await sql.begin(async (tx) => {
    // 1. Create duplicate workflow
    const duplicateRows = await tx`
      INSERT INTO workflows (
        project_id, 
        name, 
        description, 
        status, 
        settings, 
        created_by
      )
      VALUES (
        ${original.projectId},
        ${original.name + ' (Copy)'},
        ${original.description},
        'draft',
        ${JSON.stringify(original.settings)}::jsonb,
        ${actor.userId}
      )
      RETURNING id, project_id, name, description, status, active_version_id, revision, settings, created_by, created_at, updated_at
    `;
    const newWorkflowRow = duplicateRows[0];
    if (!newWorkflowRow)
      throw BitoError('INTERNAL_ERROR', 'Failed to duplicate workflow', { httpStatus: 500 });
    const newWorkflow = parseRow(workflowSchema, newWorkflowRow);

    // 2. Fetch original nodes
    const origNodes = await tx`
      SELECT id, key, type, type_version, name, position_x, position_y, config, credential_id, settings
      FROM nodes
      WHERE workflow_id = ${original.id}
    `;

    const nodeIdMap = new Map<string, string>();

    // 3. Duplicate nodes
    for (const node of origNodes) {
      const insertedNodes = await tx`
        INSERT INTO nodes (
          workflow_id,
          key,
          type,
          type_version,
          name,
          position_x,
          position_y,
          config,
          credential_id,
          settings
        ) VALUES (
          ${newWorkflow.id},
          ${node.key},
          ${node.type},
          ${node.type_version},
          ${node.name},
          ${node.position_x},
          ${node.position_y},
          ${node.config},
          ${node.credential_id},
          ${node.settings}
        )
        RETURNING id
      `;
      if (insertedNodes[0]?.id) {
        nodeIdMap.set(node.id as string, insertedNodes[0].id as string);
      }
    }

    // 4. Duplicate connections
    const origConnections = await tx`
      SELECT source_node_id, source_port, target_node_id, target_port
      FROM connections
      WHERE workflow_id = ${original.id}
    `;

    for (const conn of origConnections) {
      const newSourceId = nodeIdMap.get(conn.source_node_id as string);
      const newTargetId = nodeIdMap.get(conn.target_node_id as string);
      if (newSourceId && newTargetId) {
        await tx`
          INSERT INTO connections (
            workflow_id,
            source_node_id,
            source_port,
            target_node_id,
            target_port
          ) VALUES (
            ${newWorkflow.id},
            ${newSourceId},
            ${conn.source_port},
            ${newTargetId},
            ${conn.target_port}
          )
        `;
      }
    }

    return newWorkflow;
  });
}

export async function deleteWorkflow(actor: Actor, workflowId: string): Promise<void> {
  const existing = await findWorkflowById(actor, workflowId);
  await assertProjectRole(actor, existing.projectId, 'editor');

  const sql = getDb();
  await sql`
    DELETE FROM workflows
    WHERE id = ${workflowId}
  `;
}
