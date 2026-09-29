import { BitoError, type Item, type Json, type NodeContext } from '@bito/shared';
import type { ExecutionStore, Job, WorkflowSnapshotNode } from '../index.js';
import { planDeliveries } from '../delivery/planDeliveries.js';
import { calculateBackoff } from '../retry/backoff.js';

export async function handleErrorPath(
  rawErr: unknown,
  job: Job,
  node: WorkflowSnapshotNode,
  nodeRunId: string,
  executionId: string,
  def: {
    onError?: (
      ctx: NodeContext,
      err: BitoError
    ) => { retryable?: boolean; retryAfterMs?: number } | void;
  },
  ctx: NodeContext,
  store: ExecutionStore,
  snapshot: { connections: Parameters<typeof planDeliveries>[0] }
): Promise<void> {
  const err =
    rawErr instanceof BitoError
      ? rawErr
      : BitoError('EXECUTION_ERROR', String(rawErr), {
          retryable: rawErr instanceof Error && rawErr.name === 'AbortError',
        });

  const classified = def.onError?.(ctx, err);
  const isRetryable = classified?.retryable ?? err.retryable ?? false;
  const maxAttempts = node.settings?.retry?.maxAttempts ?? 1;

  if (isRetryable && job.attempt < maxAttempts) {
    await store.finishNodeRun(nodeRunId, {
      status: 'FAILED',
      error: { code: err.code, message: err.message, retryable: true, willRetry: true },
    });

    const delayMs = calculateBackoff(job.attempt, {
      backoff: node.settings?.retry?.backoff ?? 'exponential',
      delayMs: node.settings?.retry?.delayMs ?? 1000,
      retryAfterMs: classified?.retryAfterMs ?? (err.details?.retryAfterMs as number | undefined),
    });

    await store.enqueueJobs([
      {
        executionId,
        nodeId: node.id,
        kind: 'run',
        inputPort: job.inputPort,
        input: job.input,
        deliveryKey: `${job.deliveryKey}#a${job.attempt + 1}`,
        attempt: job.attempt + 1,
        runAt: new Date(Date.now() + delayMs).toISOString(),
      },
    ]);
    await store.markJobDone?.(job.id);
    return;
  }

  // Non-retryable or attempts exhausted
  const onErrorSetting = node.settings?.onError ?? 'stop';
  await store.finishNodeRun(nodeRunId, {
    status: 'FAILED',
    error: { code: err.code, message: err.message, retryable: false },
  });

  if (onErrorSetting === 'stop') {
    await store.setExecutionStatus(executionId, 'FAILED', {
      code: err.code,
      message: err.message,
      nodeKey: node.key,
    });
    await store.cancelExecution(executionId);
    return;
  }

  if (onErrorSetting === 'continue') {
    const forwardedItems: Item[] = job.input.map((i) => ({
      json: {
        ...i.json,
        _error: { code: err.code, message: err.message } as unknown as Json,
      },
      file: i.file,
    }));
    const deliveries = planDeliveries(snapshot.connections, node.id, {
      main: forwardedItems,
    });
    await store.enqueueJobs(
      deliveries.map((d) => ({
        executionId,
        nodeId: d.targetNodeId,
        nodeRunId,
        kind: 'run',
        inputPort: d.targetPort,
        input: d.items,
        deliveryKey: `${nodeRunId}:${d.connectionId}`,
        attempt: 1,
        runAt: new Date().toISOString(),
      }))
    );
  } else if (onErrorSetting === 'errorPort') {
    const errorItems: Item[] = job.input.map((i) => ({
      json: {
        error: { code: err.code, message: err.message, nodeKey: node.key } as unknown as Json,
        input: i.json,
      },
    }));
    const deliveries = planDeliveries(snapshot.connections, node.id, {
      error: errorItems,
    });
    await store.enqueueJobs(
      deliveries.map((d) => ({
        executionId,
        nodeId: d.targetNodeId,
        nodeRunId,
        kind: 'run',
        inputPort: d.targetPort,
        input: d.items,
        deliveryKey: `${nodeRunId}:${d.connectionId}`,
        attempt: 1,
        runAt: new Date().toISOString(),
      }))
    );
  }

  await store.markJobDone?.(job.id);
  await store.tryFinalizeExecution(executionId);
}
