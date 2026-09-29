import {
  BitoError,
  redact,
  type ExecutionMode,
  type ExecutionStatus,
  type Item,
  type Json,
} from '@bito/shared';
import type {
  Execution,
  ExecutionStore,
  Job,
  NodeRun,
  ScratchHandle,
  WorkflowSnapshot,
} from '@bito/engine';
import { getDb } from '../db/client.js';
import { mapExecution, mapJob, mapNodeRun } from './mappers.js';

export class PostgresExecutionStore implements ExecutionStore {
  async createExecution(params: {
    workflowId: string;
    versionId: string;
    projectId: string;
    mode: ExecutionMode;
    triggerNodeId?: string;
    triggerPayload?: Item[];
    vars?: Record<string, Json>;
  }): Promise<Execution> {
    const sql = getDb();
    const redactedPayload = params.triggerPayload ? redact(params.triggerPayload) : [];
    const rows = await sql`
      INSERT INTO executions (
        workflow_id, version_id, project_id, mode,
        trigger_node_id, trigger_payload, vars, status
      ) VALUES (
        ${params.workflowId}, ${params.versionId}, ${params.projectId}, ${params.mode},
        ${params.triggerNodeId ?? null},
        ${JSON.stringify(redactedPayload)}::jsonb,
        ${JSON.stringify(params.vars ?? {})}::jsonb,
        'QUEUED'
      )
      RETURNING *
    `;

    const r = rows[0];
    if (!r) throw BitoError('INTERNAL_ERROR', 'Failed to create execution');
    return mapExecution(r);
  }

  async claimJobs(workerId: string, limit: number, leaseMs: number): Promise<Job[]> {
    const sql = getDb();
    const rows = await sql`
      UPDATE jobs
      SET status = 'running',
          locked_by = ${workerId},
          locked_until = NOW() + (${leaseMs} || ' milliseconds')::interval
      WHERE id IN (
        SELECT id FROM jobs
        WHERE status = 'ready' AND run_at <= NOW()
        ORDER BY run_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING *
    `;
    return rows.map((r) => mapJob(r));
  }

  async reclaimStaleJobs(): Promise<number> {
    const sql = getDb();
    const reclaimed = await sql`
      UPDATE jobs
      SET status = 'ready', locked_by = NULL, locked_until = NULL,
          reclaim_count = reclaim_count + 1
      WHERE status = 'running' AND locked_until < NOW() AND reclaim_count < 5
      RETURNING id
    `;
    await sql`
      UPDATE jobs
      SET status = 'dead'
      WHERE status = 'running' AND locked_until < NOW() AND reclaim_count >= 5
    `;
    return reclaimed.length;
  }

  async loadSnapshot(versionId: string): Promise<WorkflowSnapshot> {
    const sql = getDb();
    const rows = await sql`
      SELECT snapshot FROM workflow_versions WHERE id = ${versionId} LIMIT 1
    `;
    const row = rows[0];
    if (!row) throw BitoError('NOT_FOUND', `Snapshot not found for version ${versionId}`);
    const snap = row.snapshot;
    return typeof snap === 'string' ? JSON.parse(snap) : snap;
  }

  async loadExecution(id: string): Promise<Execution> {
    const sql = getDb();
    const rows = await sql`SELECT * FROM executions WHERE id = ${id} LIMIT 1`;
    const row = rows[0];
    if (!row) throw BitoError('NOT_FOUND', `Execution not found with id ${id}`);
    return mapExecution(row);
  }

  async startNodeRun(job: Job): Promise<NodeRun> {
    const sql = getDb();
    if (job.kind === 'resume' && job.nodeRunId) {
      const existing = await sql`
        UPDATE node_runs SET status = 'RUNNING'
        WHERE id = ${job.nodeRunId} RETURNING *
      `;
      if (existing[0]) return mapNodeRun(existing[0]);
    }
    const wfRows = await sql`
      SELECT snapshot FROM workflow_versions WHERE id = (
        SELECT version_id FROM executions WHERE id = ${job.executionId}
      ) LIMIT 1
    `;
    let nodeKey = job.nodeId;
    if (wfRows[0]?.snapshot) {
      const snap =
        typeof wfRows[0].snapshot === 'string'
          ? JSON.parse(wfRows[0].snapshot)
          : wfRows[0].snapshot;
      const found = snap.nodes?.find((n: { id: string; key: string }) => n.id === job.nodeId);
      if (found?.key) nodeKey = found.key;
    }

    const rows = await sql`
      INSERT INTO node_runs (
        execution_id, node_id, node_key, status,
        attempt, input_port, input, queued_at, started_at
      ) VALUES (
        ${job.executionId}, ${job.nodeId}, ${nodeKey}, 'RUNNING',
        ${job.attempt}, ${job.inputPort},
        ${JSON.stringify(job.input)}::jsonb,
        NOW(), NOW()
      )
      RETURNING *
    `;
    const r = rows[0];
    if (!r) throw BitoError('INTERNAL_ERROR', 'Failed to start node run');

    await sql`UPDATE jobs SET node_run_id = ${r.id} WHERE id = ${job.id}`;
    await sql`
      UPDATE executions 
      SET node_run_count = node_run_count + 1,
          started_at = COALESCE(started_at, NOW()),
          status = CASE WHEN status = 'QUEUED' THEN 'RUNNING' ELSE status END
      WHERE id = ${job.executionId}
    `;
    return mapNodeRun(r);
  }

  async finishNodeRun(id: string, patch: Partial<NodeRun>): Promise<void> {
    const sql = getDb();
    const finishedAt =
      patch.finishedAt ??
      (['SUCCESS', 'FAILED', 'CANCELLED', 'SKIPPED'].includes(patch.status ?? '')
        ? new Date().toISOString()
        : null);

    const statusVal = patch.status ?? null;
    const outputVal = patch.output !== undefined ? JSON.stringify(patch.output) : null;
    const progressVal = patch.progress !== undefined ? JSON.stringify(patch.progress) : null;
    const errorVal = patch.error !== undefined ? JSON.stringify(patch.error) : null;
    const finishedAtVal = finishedAt ?? null;

    await sql`
      UPDATE node_runs
      SET 
        status = COALESCE(${statusVal}, status),
        output = CASE WHEN ${outputVal !== null} THEN ${outputVal}::jsonb ELSE output END,
        progress = CASE WHEN ${progressVal !== null} THEN ${progressVal}::jsonb ELSE progress END,
        error = CASE WHEN ${errorVal !== null} THEN ${errorVal}::jsonb ELSE error END,
        finished_at = CASE WHEN ${finishedAtVal !== null} THEN ${finishedAtVal}::timestamptz ELSE finished_at END,
        duration_ms = CASE 
          WHEN ${finishedAtVal !== null} AND started_at IS NOT NULL 
          THEN (EXTRACT(EPOCH FROM (${finishedAtVal}::timestamptz - started_at)) * 1000)::integer 
          ELSE duration_ms 
        END
      WHERE id = ${id}
    `;
  }

  async enqueueJobs(
    jobs: Array<Omit<Job, 'id' | 'createdAt' | 'status' | 'reclaimCount'>>
  ): Promise<void> {
    if (jobs.length === 0) return;
    const sql = getDb();
    for (const j of jobs) {
      await sql`
        INSERT INTO jobs (
          execution_id, node_id, node_run_id, kind,
          input_port, input, delivery_key, attempt, status, run_at
        ) VALUES (
          ${j.executionId}, ${j.nodeId}, ${j.nodeRunId ?? null}, ${j.kind},
          ${j.inputPort}, ${JSON.stringify(j.input)}::jsonb,
          ${j.deliveryKey}, ${j.attempt}, 'ready', ${j.runAt}::timestamptz
        )
        ON CONFLICT (execution_id, delivery_key, kind) DO NOTHING
      `;
    }
  }

  async withScratchLock<T>(
    executionId: string,
    nodeId: string,
    fn: (s: ScratchHandle) => Promise<T>
  ): Promise<T> {
    const sql = getDb();
    const result = await sql.begin(async (tx) => {
      await tx`
        INSERT INTO execution_scratch (execution_id, node_id, state)
        VALUES (${executionId}, ${nodeId}, '{}'::jsonb)
        ON CONFLICT (execution_id, node_id) DO NOTHING
      `;
      const rows = await tx`
        SELECT state FROM execution_scratch
        WHERE execution_id = ${executionId} AND node_id = ${nodeId} FOR UPDATE
      `;
      const raw = rows[0]?.state;
      let currentState: Json = (typeof raw === 'string' ? JSON.parse(raw) : raw) ?? {};

      const handle: ScratchHandle = {
        async get() {
          return currentState;
        },
        async set(val: Json) {
          currentState = val;
          await tx`
            UPDATE execution_scratch
            SET state = ${JSON.stringify(val)}::jsonb
            WHERE execution_id = ${executionId} AND node_id = ${nodeId}
          `;
        },
      };
      return await fn(handle);
    });
    return result as unknown as T;
  }

  async appendLog(entry: {
    executionId: string;
    nodeRunId?: string;
    level: 'debug' | 'info' | 'warn' | 'error';
    kind: 'system' | 'node' | 'http' | 'ai_step';
    message: string;
    data?: unknown;
  }): Promise<void> {
    const sql = getDb();
    const redactedData = entry.data !== undefined ? redact(entry.data) : null;
    await sql`
      INSERT INTO logs (
        execution_id, node_run_id, level, kind, message, data
      ) VALUES (
        ${entry.executionId}, ${entry.nodeRunId ?? null},
        ${entry.level}, ${entry.kind}, ${entry.message},
        ${redactedData !== null ? JSON.stringify(redactedData) : null}::jsonb
      )
    `;
  }

  async tryFinalizeExecution(executionId: string): Promise<ExecutionStatus | null> {
    const sql = getDb();
    const execRows = await sql`SELECT status FROM executions WHERE id = ${executionId} LIMIT 1`;
    const exec = execRows[0];
    if (!exec) return null;
    if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(exec.status as string)) {
      return exec.status as ExecutionStatus;
    }

    const activeJobs = await sql`
      SELECT id FROM jobs
      WHERE execution_id = ${executionId} AND status IN ('ready', 'running') LIMIT 1
    `;
    if (activeJobs.length > 0) return exec.status as ExecutionStatus;

    const waitingRuns = await sql`
      SELECT id FROM node_runs
      WHERE execution_id = ${executionId} AND status = 'WAITING' LIMIT 1
    `;
    if (waitingRuns.length > 0) {
      await sql`
        UPDATE executions SET status = 'WAITING'
        WHERE id = ${executionId} AND status NOT IN ('SUCCESS', 'FAILED', 'CANCELLED')
      `;
      return 'WAITING';
    }

    await sql`
      UPDATE executions SET status = 'SUCCESS', finished_at = NOW()
      WHERE id = ${executionId} AND status NOT IN ('SUCCESS', 'FAILED', 'CANCELLED')
    `;
    return 'SUCCESS';
  }

  async setExecutionStatus(
    id: string,
    status: ExecutionStatus,
    error?: Record<string, unknown>
  ): Promise<void> {
    const sql = getDb();
    const errorVal = error !== undefined ? JSON.stringify(error) : null;
    await sql`
      UPDATE executions
      SET status = ${status},
          error = CASE WHEN ${errorVal !== null} THEN ${errorVal}::jsonb ELSE error END,
          started_at = CASE WHEN ${status === 'RUNNING'} AND started_at IS NULL THEN NOW() ELSE started_at END,
          finished_at = CASE WHEN ${['SUCCESS', 'FAILED', 'CANCELLED'].includes(status)} THEN NOW() ELSE finished_at END
      WHERE id = ${id} AND status NOT IN ('SUCCESS', 'FAILED', 'CANCELLED')
    `;
  }

  async cancelExecution(id: string): Promise<void> {
    const sql = getDb();
    await sql.begin(async (tx) => {
      await tx`
        UPDATE executions SET status = 'CANCELLED', finished_at = NOW()
        WHERE id = ${id} AND status NOT IN ('SUCCESS', 'FAILED', 'CANCELLED')
      `;
      await tx`
        UPDATE jobs SET status = 'dead'
        WHERE execution_id = ${id} AND status IN ('ready', 'running')
      `;
      await tx`
        UPDATE node_runs SET status = 'CANCELLED', finished_at = NOW()
        WHERE execution_id = ${id} AND status IN ('QUEUED', 'WAITING')
      `;
    });
  }

  async loadPriorNodeRuns(executionId: string): Promise<NodeRun[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM node_runs WHERE execution_id = ${executionId} ORDER BY queued_at ASC
    `;
    return rows.map((r) => mapNodeRun(r));
  }

  async updateExecutionVars(id: string, vars: Record<string, Json>): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE executions SET vars = vars || ${JSON.stringify(vars)}::jsonb WHERE id = ${id}
    `;
  }

  async markJobDone(jobId: string): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE jobs SET status = 'done', locked_by = NULL, locked_until = NULL WHERE id = ${jobId}
    `;
  }
}
