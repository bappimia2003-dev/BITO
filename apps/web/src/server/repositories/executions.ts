import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

const parseJsonField = (val: unknown) => {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
};

export const executionSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  versionId: z.string().uuid(),
  projectId: z.string().uuid(),
  status: z.enum(['QUEUED', 'RUNNING', 'WAITING', 'SUCCESS', 'FAILED', 'CANCELLED']),
  mode: z.enum(['trigger', 'manual', 'schedule', 'retry']),
  triggerNodeId: z.string().uuid().nullable().optional(),
  triggerPayload: z.preprocess(parseJsonField, z.unknown()).nullable().optional(),
  vars: z.preprocess(parseJsonField, z.record(z.unknown())).default({}),
  error: z.preprocess(parseJsonField, z.unknown()).nullable().optional(),
  nodeRunCount: z.number().int().default(0),
  createdAt: z.string(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
});

export type Execution = z.infer<typeof executionSchema>;

export const nodeRunSchema = z.object({
  id: z.string().uuid(),
  executionId: z.string().uuid(),
  nodeId: z.string().uuid(),
  nodeKey: z.string(),
  status: z.enum(['QUEUED', 'RUNNING', 'WAITING', 'SUCCESS', 'FAILED', 'CANCELLED', 'SKIPPED']),
  attempt: z.number().int().default(1),
  inputPort: z.string().default('main'),
  input: z.preprocess(parseJsonField, z.unknown()).nullable().optional(),
  output: z.preprocess(parseJsonField, z.unknown()).nullable().optional(),
  progress: z.preprocess(parseJsonField, z.unknown()).nullable().optional(),
  error: z.preprocess(parseJsonField, z.unknown()).nullable().optional(),
  queuedAt: z.string(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  durationMs: z.number().int().nullable().optional(),
});

export type NodeRun = z.infer<typeof nodeRunSchema>;

export const executionLogSchema = z.object({
  id: z.string(),
  executionId: z.string().uuid(),
  nodeRunId: z.string().uuid().nullable().optional(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  kind: z.enum(['system', 'node', 'http', 'ai_step']),
  message: z.string(),
  data: z.unknown().nullable().optional(),
  ts: z.string(),
});

export type ExecutionLog = z.infer<typeof executionLogSchema>;

export interface ExecutionDetail {
  execution: Execution;
  nodeRuns: NodeRun[];
  [key: string]: unknown;
}

export async function listExecutions(
  actor: Actor,
  projectId: string,
  workflowId?: string,
  cursor?: string,
  limit: number = 50,
  status?: string
): Promise<Execution[]> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const clampedLimit = Math.min(Math.max(1, limit), 100);

  const rows = await sql`
    SELECT id, workflow_id, version_id, project_id, status, mode, trigger_node_id, trigger_payload, vars, error, node_run_count, created_at, started_at, finished_at
    FROM executions
    WHERE project_id = ${projectId}
      ${workflowId ? sql`AND workflow_id = ${workflowId}` : sql``}
      ${status ? sql`AND status = ${status}` : sql``}
      ${cursor ? sql`AND id < ${cursor}` : sql``}
    ORDER BY created_at DESC
    LIMIT ${clampedLimit}
  `;
  return rows.map((r) => parseRow(executionSchema, r));
}

export async function findExecutionById(
  actor: Actor,
  executionId: string
): Promise<ExecutionDetail> {
  const sql = getDb();
  const execRows = await sql`
    SELECT id, workflow_id, version_id, project_id, status, mode, trigger_node_id, trigger_payload, vars, error, node_run_count, created_at, started_at, finished_at
    FROM executions
    WHERE id = ${executionId}
    LIMIT 1
  `;
  if (!execRows[0]) {
    throw BitoError('NOT_FOUND', 'Execution not found', { httpStatus: 404 });
  }
  const execution = parseRow(executionSchema, execRows[0]);
  await assertProjectRole(actor, execution.projectId, 'viewer');

  const runRows = await sql`
    SELECT id, execution_id, node_id, node_key, status, attempt, input_port, input, output, progress, error, queued_at, started_at, finished_at, duration_ms
    FROM node_runs
    WHERE execution_id = ${executionId}
    ORDER BY queued_at ASC, attempt ASC
  `;
  const nodeRuns = runRows.map((r) => parseRow(nodeRunSchema, r));

  return { execution, nodeRuns };
}

export async function getExecutionLogs(
  actor: Actor,
  executionId: string,
  options: { level?: string; kind?: string; limit?: number } = {}
): Promise<ExecutionLog[]> {
  const sql = getDb();
  const execRows = await sql`
    SELECT project_id FROM executions WHERE id = ${executionId} LIMIT 1
  `;
  if (!execRows[0]) {
    throw BitoError('NOT_FOUND', 'Execution not found', { httpStatus: 404 });
  }
  await assertProjectRole(actor, execRows[0].project_id as string, 'viewer');

  const limit = Math.min(Math.max(1, options.limit ?? 200), 500);
  const rows = await sql`
    SELECT id::text, execution_id, node_run_id, level, kind, message, data, ts
    FROM logs
    WHERE execution_id = ${executionId}
      ${options.level ? sql`AND level = ${options.level}` : sql``}
      ${options.kind ? sql`AND kind = ${options.kind}` : sql``}
    ORDER BY id ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => parseRow(executionLogSchema, r));
}
