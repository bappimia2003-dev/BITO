import type { ExecutionMode, ExecutionStatus, NodeRunStatus } from '@bito/shared';
import type { Execution, Job, NodeRun } from '@bito/engine';

export function mapExecution(row: Record<string, unknown>): Execution {
  const varsRaw = row['vars'];
  const payloadRaw = row['trigger_payload'];
  const errorRaw = row['error'];

  return {
    id: row['id'] as string,
    workflowId: row['workflow_id'] as string,
    versionId: row['version_id'] as string,
    projectId: row['project_id'] as string,
    status: row['status'] as ExecutionStatus,
    mode: row['mode'] as ExecutionMode,
    triggerNodeId: (row['trigger_node_id'] as string) ?? undefined,
    triggerPayload:
      (typeof payloadRaw === 'string' ? JSON.parse(payloadRaw) : payloadRaw) ?? undefined,
    vars: (typeof varsRaw === 'string' ? JSON.parse(varsRaw) : varsRaw) ?? {},
    error: (typeof errorRaw === 'string' ? JSON.parse(errorRaw) : errorRaw) ?? undefined,
    retryOfExecutionId: (row['retry_of_execution_id'] as string) ?? undefined,
    nodeRunCount: Number(row['node_run_count'] ?? 0),
    createdAt: String(row['created_at']),
    startedAt: row['started_at'] ? String(row['started_at']) : undefined,
    finishedAt: row['finished_at'] ? String(row['finished_at']) : undefined,
  };
}

export function mapJob(row: Record<string, unknown>): Job {
  const inputRaw = row['input'];
  return {
    id: String(row['id']),
    executionId: row['execution_id'] as string,
    nodeId: row['node_id'] as string,
    nodeRunId: (row['node_run_id'] as string) ?? undefined,
    kind: row['kind'] as 'run' | 'resume',
    inputPort: (row['input_port'] as string) ?? 'main',
    input: (typeof inputRaw === 'string' ? JSON.parse(inputRaw) : inputRaw) ?? [],
    deliveryKey: row['delivery_key'] as string,
    attempt: Number(row['attempt'] ?? 1),
    reclaimCount: Number(row['reclaim_count'] ?? 0),
    status: row['status'] as 'ready' | 'running' | 'done' | 'dead',
    runAt: String(row['run_at']),
    lockedBy: (row['locked_by'] as string) ?? undefined,
    lockedUntil: row['locked_until'] ? String(row['locked_until']) : undefined,
    createdAt: String(row['created_at']),
  };
}

export function mapNodeRun(row: Record<string, unknown>): NodeRun {
  const inputRaw = row['input'];
  const outputRaw = row['output'];
  const progressRaw = row['progress'];
  const errorRaw = row['error'];

  return {
    id: row['id'] as string,
    executionId: row['execution_id'] as string,
    nodeId: row['node_id'] as string,
    nodeKey: row['node_key'] as string,
    status: row['status'] as NodeRunStatus,
    attempt: Number(row['attempt'] ?? 1),
    inputPort: (row['input_port'] as string) ?? 'main',
    input: (typeof inputRaw === 'string' ? JSON.parse(inputRaw) : inputRaw) ?? undefined,
    output: (() => {
      let p = typeof outputRaw === 'string' ? JSON.parse(outputRaw) : outputRaw;
      if (typeof p === 'string') {
        try {
          p = JSON.parse(p);
        } catch {
          p = outputRaw;
        }
      }
      return p ?? undefined;
    })(),
    progress:
      (typeof progressRaw === 'string' ? JSON.parse(progressRaw) : progressRaw) ?? undefined,
    error: (typeof errorRaw === 'string' ? JSON.parse(errorRaw) : errorRaw) ?? undefined,
    queuedAt: String(row['queued_at']),
    startedAt: row['started_at'] ? String(row['started_at']) : undefined,
    finishedAt: row['finished_at'] ? String(row['finished_at']) : undefined,
    durationMs:
      row['duration_ms'] !== null && row['duration_ms'] !== undefined
        ? Number(row['duration_ms'])
        : undefined,
  };
}
