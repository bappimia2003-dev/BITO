import { BitoError } from '@bito/shared';
import { getDb } from '../db/client.js';
import { PostgresExecutionStore } from './postgresExecutionStore.js';

export async function retryExecution(executionId: string): Promise<string> {
  const sql = getDb();
  const store = new PostgresExecutionStore();

  const oldExec = await store.loadExecution(executionId);
  if (oldExec.status !== 'FAILED') {
    throw BitoError(
      'BAD_REQUEST',
      `Cannot retry execution with status "${oldExec.status}". Only FAILED executions can be retried.`
    );
  }

  // Find failed node run
  const failedRuns = await sql`
    SELECT * FROM node_runs
    WHERE execution_id = ${executionId} AND status = 'FAILED'
    ORDER BY queued_at DESC
    LIMIT 1
  `;
  const failedRun = failedRuns[0];
  if (!failedRun) {
    throw BitoError('NOT_FOUND', 'No failed node run found in execution to retry');
  }

  // 1. Create new execution
  const newExecRows = await sql`
    INSERT INTO executions (
      workflow_id,
      version_id,
      project_id,
      mode,
      trigger_node_id,
      trigger_payload,
      vars,
      status,
      retry_of_execution_id
    ) VALUES (
      ${oldExec.workflowId},
      ${oldExec.versionId},
      ${oldExec.projectId},
      'retry',
      ${oldExec.triggerNodeId ?? null},
      ${JSON.stringify(oldExec.triggerPayload ?? [])}::jsonb,
      ${JSON.stringify(oldExec.vars ?? {})}::jsonb,
      'QUEUED',
      ${oldExec.id}
    )
    RETURNING id
  `;
  const newExecId = newExecRows[0]?.id as string;
  if (!newExecId) {
    throw BitoError('INTERNAL_ERROR', 'Failed to create retry execution');
  }

  // 2. Copy successful node runs from previous run so downstream expressions can access nodes.<key>.json
  const successRuns = await sql`
    SELECT node_id, node_key, output, queued_at
    FROM node_runs
    WHERE execution_id = ${executionId} AND status = 'SUCCESS'
    ORDER BY queued_at ASC
  `;

  for (const sr of successRuns) {
    await sql`
      INSERT INTO node_runs (
        execution_id,
        node_id,
        node_key,
        status,
        attempt,
        input_port,
        output,
        queued_at,
        started_at,
        finished_at
      ) VALUES (
        ${newExecId},
        ${sr.node_id},
        ${sr.node_key},
        'SUCCESS',
        1,
        'main',
        ${typeof sr.output === 'string' ? sr.output : JSON.stringify(sr.output ?? {})}::jsonb,
        NOW(),
        NOW(),
        NOW()
      )
    `;
  }

  // 3. Enqueue job for failed node
  const failedInput =
    (typeof failedRun.input === 'string' ? JSON.parse(failedRun.input) : failedRun.input) ?? [];
  await store.enqueueJobs([
    {
      executionId: newExecId,
      nodeId: failedRun.node_id as string,
      kind: 'run',
      inputPort: (failedRun.input_port as string) ?? 'main',
      input: failedInput,
      deliveryKey: 'retry:0',
      attempt: 1,
      runAt: new Date().toISOString(),
    },
  ]);

  // 4. Append initial system log
  await store.appendLog({
    executionId: newExecId,
    level: 'info',
    kind: 'system',
    message: `Execution retry queued from failed node ${failedRun.node_key}`,
    data: { retryOf: executionId, failedNodeId: failedRun.node_id },
  });

  return newExecId;
}
