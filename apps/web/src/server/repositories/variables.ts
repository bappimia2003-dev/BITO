import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

export const variableKeySchema = z
  .string()
  .min(1, 'Key is required')
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    'Key must start with a letter or underscore and contain only alphanumeric characters and underscores'
  );

export const variableSchema = z.object({
  id: z.string().uuid(),
  scope: z.enum(['global', 'project', 'workflow']),
  ownerId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  workflowId: z.string().uuid().nullable().optional(),
  key: variableKeySchema,
  value: z.preprocess((val) => (typeof val === 'string' ? JSON.parse(val) : val), z.unknown()),
  updatedAt: z.string(),
});

export type VariableRecord = z.infer<typeof variableSchema>;

export interface ListVariablesFilter {
  scope: 'global' | 'project' | 'workflow';
  projectId?: string;
  workflowId?: string;
}

export async function listVariables(
  actor: Actor,
  filter: ListVariablesFilter
): Promise<VariableRecord[]> {
  const sql = getDb();

  if (filter.scope === 'global') {
    const rows = await sql`
      SELECT id, scope, owner_id, project_id, workflow_id, key, value, updated_at
      FROM variables
      WHERE scope = 'global' AND owner_id = ${actor.userId}
      ORDER BY key ASC
    `;
    return rows.map((r) => parseRow(variableSchema, r));
  }

  if (filter.scope === 'project') {
    if (!filter.projectId) {
      throw BitoError('VALIDATION_FAILED', 'projectId is required for project scope variables', {
        httpStatus: 400,
      });
    }
    await assertProjectRole(actor, filter.projectId, 'viewer');

    const rows = await sql`
      SELECT id, scope, owner_id, project_id, workflow_id, key, value, updated_at
      FROM variables
      WHERE scope = 'project' AND project_id = ${filter.projectId}
      ORDER BY key ASC
    `;
    return rows.map((r) => parseRow(variableSchema, r));
  }

  if (filter.scope === 'workflow') {
    if (!filter.workflowId) {
      throw BitoError('VALIDATION_FAILED', 'workflowId is required for workflow scope variables', {
        httpStatus: 400,
      });
    }

    const wfRows = await sql`
      SELECT project_id FROM workflows WHERE id = ${filter.workflowId}
    `;
    const wf = wfRows[0];
    if (!wf) {
      throw BitoError('NOT_FOUND', 'Workflow not found', { httpStatus: 404 });
    }
    await assertProjectRole(actor, wf.project_id, 'viewer');

    const rows = await sql`
      SELECT id, scope, owner_id, project_id, workflow_id, key, value, updated_at
      FROM variables
      WHERE scope = 'workflow' AND workflow_id = ${filter.workflowId}
      ORDER BY key ASC
    `;
    return rows.map((r) => parseRow(variableSchema, r));
  }

  throw BitoError('VALIDATION_FAILED', 'Invalid variable scope', { httpStatus: 400 });
}

export async function findVariableById(actor: Actor, variableId: string): Promise<VariableRecord> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, scope, owner_id, project_id, workflow_id, key, value, updated_at
    FROM variables
    WHERE id = ${variableId}
  `;
  const row = rows[0];
  if (!row) {
    throw BitoError('NOT_FOUND', `Variable not found: ${variableId}`, { httpStatus: 404 });
  }

  if (row.scope === 'global') {
    if (row.owner_id !== actor.userId) {
      throw BitoError('FORBIDDEN', 'Access denied to global variable', { httpStatus: 403 });
    }
  } else if (row.scope === 'project') {
    await assertProjectRole(actor, row.project_id, 'viewer');
  } else if (row.scope === 'workflow') {
    const wfRows = await sql`
      SELECT project_id FROM workflows WHERE id = ${row.workflow_id}
    `;
    const wf = wfRows[0];
    if (!wf) {
      throw BitoError('NOT_FOUND', 'Parent workflow not found', { httpStatus: 404 });
    }
    await assertProjectRole(actor, wf.project_id, 'viewer');
  }

  return parseRow(variableSchema, row);
}

export async function createVariable(
  actor: Actor,
  input: {
    scope: 'global' | 'project' | 'workflow';
    key: string;
    value: unknown;
    projectId?: string;
    workflowId?: string;
  }
): Promise<VariableRecord> {
  const key = variableKeySchema.parse(input.key.trim());
  const sql = getDb();

  let ownerId: string | null = null;
  let projectId: string | null = null;
  let workflowId: string | null = null;

  if (input.scope === 'global') {
    ownerId = actor.userId;
  } else if (input.scope === 'project') {
    if (!input.projectId) {
      throw BitoError('VALIDATION_FAILED', 'projectId is required for project scope variables', {
        httpStatus: 400,
      });
    }
    await assertProjectRole(actor, input.projectId, 'editor');
    projectId = input.projectId;
  } else if (input.scope === 'workflow') {
    if (!input.workflowId) {
      throw BitoError('VALIDATION_FAILED', 'workflowId is required for workflow scope variables', {
        httpStatus: 400,
      });
    }
    const wfRows = await sql`
      SELECT project_id FROM workflows WHERE id = ${input.workflowId}
    `;
    const wf = wfRows[0];
    if (!wf) {
      throw BitoError('NOT_FOUND', 'Workflow not found', { httpStatus: 404 });
    }
    await assertProjectRole(actor, wf.project_id, 'editor');
    workflowId = input.workflowId;
  }

  try {
    const jsonVal = JSON.stringify(input.value !== undefined ? input.value : null);
    const rows = await sql`
      INSERT INTO variables (
        scope,
        owner_id,
        project_id,
        workflow_id,
        key,
        value
      ) VALUES (
        ${input.scope},
        ${ownerId},
        ${projectId},
        ${workflowId},
        ${key},
        ${jsonVal}::jsonb
      )
      RETURNING id, scope, owner_id, project_id, workflow_id, key, value, updated_at
    `;
    const row = rows[0];
    if (!row) {
      throw BitoError('PROVIDER_ERROR', 'Failed to create variable');
    }
    return parseRow(variableSchema, row);
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === '23505'
    ) {
      throw BitoError(
        'VALIDATION_FAILED',
        `A variable with key "${key}" already exists in this ${input.scope} scope`,
        { httpStatus: 409 }
      );
    }
    throw error;
  }
}

export async function updateVariable(
  actor: Actor,
  variableId: string,
  input: {
    key?: string;
    value?: unknown;
  }
): Promise<VariableRecord> {
  const sql = getDb();
  const existingRows = await sql`
    SELECT id, scope, owner_id, project_id, workflow_id, key, value
    FROM variables
    WHERE id = ${variableId}
  `;
  const existing = existingRows[0];
  if (!existing) {
    throw BitoError('NOT_FOUND', `Variable not found: ${variableId}`, { httpStatus: 404 });
  }

  if (existing.scope === 'global') {
    if (existing.owner_id !== actor.userId) {
      throw BitoError('FORBIDDEN', 'Access denied to global variable', { httpStatus: 403 });
    }
  } else if (existing.scope === 'project') {
    await assertProjectRole(actor, existing.project_id, 'editor');
  } else if (existing.scope === 'workflow') {
    const wfRows = await sql`
      SELECT project_id FROM workflows WHERE id = ${existing.workflow_id}
    `;
    const wf = wfRows[0];
    if (!wf) {
      throw BitoError('NOT_FOUND', 'Workflow not found', { httpStatus: 404 });
    }
    await assertProjectRole(actor, wf.project_id, 'editor');
  }

  const newKey = input.key ? variableKeySchema.parse(input.key.trim()) : existing.key;
  const newValue = input.value !== undefined ? input.value : existing.value;
  const jsonVal = JSON.stringify(newValue !== undefined ? newValue : null);

  try {
    const rows = await sql`
      UPDATE variables
      SET
        key = ${newKey},
        value = ${jsonVal}::jsonb,
        updated_at = NOW()
      WHERE id = ${variableId}
      RETURNING id, scope, owner_id, project_id, workflow_id, key, value, updated_at
    `;
    const row = rows[0];
    if (!row) {
      throw BitoError('NOT_FOUND', `Variable not found: ${variableId}`, { httpStatus: 404 });
    }
    return parseRow(variableSchema, row);
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === '23505'
    ) {
      throw BitoError(
        'VALIDATION_FAILED',
        `A variable with key "${newKey}" already exists in this scope`,
        { httpStatus: 409 }
      );
    }
    throw error;
  }
}

export async function deleteVariable(actor: Actor, variableId: string): Promise<void> {
  const sql = getDb();
  const existingRows = await sql`
    SELECT id, scope, owner_id, project_id, workflow_id
    FROM variables
    WHERE id = ${variableId}
  `;
  const existing = existingRows[0];
  if (!existing) {
    throw BitoError('NOT_FOUND', `Variable not found: ${variableId}`, { httpStatus: 404 });
  }

  if (existing.scope === 'global') {
    if (existing.owner_id !== actor.userId) {
      throw BitoError('FORBIDDEN', 'Access denied to global variable', { httpStatus: 403 });
    }
  } else if (existing.scope === 'project') {
    await assertProjectRole(actor, existing.project_id, 'editor');
  } else if (existing.scope === 'workflow') {
    const wfRows = await sql`
      SELECT project_id FROM workflows WHERE id = ${existing.workflow_id}
    `;
    const wf = wfRows[0];
    if (!wf) {
      throw BitoError('NOT_FOUND', 'Workflow not found', { httpStatus: 404 });
    }
    await assertProjectRole(actor, wf.project_id, 'editor');
  }

  await sql`
    DELETE FROM variables WHERE id = ${variableId}
  `;
}
