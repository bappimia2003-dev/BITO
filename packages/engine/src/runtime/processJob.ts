import {
  BitoError,
  type Item,
  type Json,
  type NodeContext,
  type NodeResult,
  type SafeHttp,
} from '@bito/shared';
import type {
  Clock,
  CredentialResolver,
  ExecutionStore,
  Job,
  NodeRegistry,
  WorkflowSnapshotNode,
} from '../index.js';
import { buildExpressionScope } from './buildScope.js';
import { resolveConfigExpressions } from './resolveConfig.js';
import { planDeliveries } from '../delivery/planDeliveries.js';
import { handleErrorPath } from './handleError.js';

export interface ProcessJobOptions {
  store: ExecutionStore;
  registry: NodeRegistry;
  http: SafeHttp;
  credentialResolver: CredentialResolver;
  clock?: Clock;
  maxNodeRuns?: number;
  maxExecutionSeconds?: number;
}

export async function processJob(job: Job, options: ProcessJobOptions): Promise<void> {
  const { store, registry, http, credentialResolver, clock } = options;
  const now = clock ? clock.now() : new Date();

  // 1. Load execution
  const exec = await store.loadExecution(job.executionId);
  if (['CANCELLED', 'FAILED', 'SUCCESS'].includes(exec.status)) {
    return;
  }

  // 2. Limits check
  const maxNodeRuns = options.maxNodeRuns ?? 1000;
  if (exec.nodeRunCount >= maxNodeRuns) {
    await store.setExecutionStatus(exec.id, 'FAILED', {
      code: 'MAX_NODE_RUNS_EXCEEDED',
      message: `Node runs limit (${maxNodeRuns}) exceeded`,
    });
    await store.cancelExecution(exec.id);
    return;
  }

  const maxExecutionSeconds = options.maxExecutionSeconds ?? 900;
  if (exec.startedAt) {
    const elapsedSec = (now.getTime() - new Date(exec.startedAt).getTime()) / 1000;
    if (elapsedSec > maxExecutionSeconds) {
      await store.setExecutionStatus(exec.id, 'FAILED', {
        code: 'EXECUTION_TIMEOUT',
        message: `Execution timeout (${maxExecutionSeconds}s) exceeded`,
      });
      await store.cancelExecution(exec.id);
      return;
    }
  }

  // 3. Load snapshot & node definition
  const snapshot = await store.loadSnapshot(exec.versionId);
  const node = snapshot.nodes.find((n) => n.id === job.nodeId);
  if (!node) {
    throw BitoError('NOT_FOUND', `Node ${job.nodeId} not found in snapshot`);
  }

  const def = registry.get(node.type);
  if (!def) {
    throw BitoError('NODE_TYPE_UNKNOWN', `Unknown node type: ${node.type}`);
  }

  // 4. Start node run
  const nodeRun = await store.startNodeRun(job);

  // 5. Resume job kind
  if (job.kind === 'resume') {
    const outputs = { main: job.input };
    await store.finishNodeRun(nodeRun.id, { status: 'SUCCESS', output: outputs });
    await forwardSuccessOutputs(store, snapshot, node, nodeRun.id, exec.id, job.id, outputs, now);
    return;
  }

  // 6. Disabled node check
  if (node.settings?.disabled) {
    const outputs = { main: job.input };
    await store.finishNodeRun(nodeRun.id, { status: 'SKIPPED', output: outputs });
    await forwardSuccessOutputs(store, snapshot, node, nodeRun.id, exec.id, job.id, outputs, now);
    return;
  }

  // 7. Run handler
  const priorRuns = (await store.loadPriorNodeRuns?.(exec.id)) ?? [];
  const timeoutMs = Math.min(Math.max(node.settings?.timeoutMs ?? 30_000, 1000), 120_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const ctx: NodeContext = {
    executionId: exec.id,
    workflowId: exec.workflowId,
    projectId: exec.projectId,
    nodeKey: node.key,
    inputPort: job.inputPort,
    attempt: job.attempt,
    signal: controller.signal,
    http,
    getCredential: async <T>(_type: string): Promise<T> => {
      const credId = node.credentialId;
      if (!credId) {
        throw BitoError('CREDENTIAL_MISSING', `Missing credential on node ${node.key}`);
      }
      return (await credentialResolver.resolve(exec.projectId, credId)) as T;
    },
    scratch: {
      get: async () => null,
      set: async () => {},
    },
    files: {
      getFile: async () => null,
    },
    dataTables: {
      query: async () => [],
      insert: async () => ({}),
      update: async () => ({}),
      delete: async () => 0,
    },
    log(level, message, data) {
      void store.appendLog({
        executionId: exec.id,
        nodeRunId: nodeRun.id,
        level,
        kind: 'node',
        message,
        data,
      });
    },
    emitAiStep(step) {
      void store.appendLog({
        executionId: exec.id,
        nodeRunId: nodeRun.id,
        level: 'info',
        kind: 'ai_step',
        message: `AI step ${step.stepNumber}`,
        data: step as unknown as Json,
      });
    },
    now: () => (clock ? clock.now() : new Date()),
  };

  try {
    let result: NodeResult;

    if (def.mode === 'perItem') {
      const priorRun = priorRuns
        .filter((r) => r.nodeId === node.id && r.id !== nodeRun.id)
        .sort((a, b) => b.attempt - a.attempt)[0];
      const priorProgress = (nodeRun.progress ?? priorRun?.progress) as
        { done?: number; outputs?: Record<string, Item[]> } | undefined;

      const doneIndex = Number(priorProgress?.done ?? 0);
      const accumulated: Record<string, Item[]> = priorProgress?.outputs
        ? { ...priorProgress.outputs }
        : {};

      for (let i = doneIndex; i < job.input.length; i++) {
        if (controller.signal.aborted) {
          throw BitoError('TIMEOUT', `Node execution timed out after ${timeoutMs}ms`, {
            retryable: true,
          });
        }
        const item = job.input[i]!;
        const itemScope = buildExpressionScope({
          execution: exec,
          snapshot,
          priorRuns,
          currentItem: item,
          allItems: job.input,
          itemIndex: i,
          clock,
        });

        const rawResolved = resolveConfigExpressions(node.config, itemScope);
        const parseRes = def.configSchema.safeParse(rawResolved);
        if (!parseRes.success) {
          throw BitoError(
            'CONFIG_INVALID',
            `Node configuration invalid: ${JSON.stringify(parseRes.error.issues)}`
          );
        }

        const itemRes = await def.execute(ctx, [item], parseRes.data);
        for (const [port, items] of Object.entries(itemRes.outputs)) {
          accumulated[port] = [...(accumulated[port] ?? []), ...items];
        }

        await store.finishNodeRun(nodeRun.id, {
          progress: { done: i + 1, outputs: accumulated },
        });
      }

      result = { outputs: accumulated };
    } else {
      // Batch mode
      const batchScope = buildExpressionScope({
        execution: exec,
        snapshot,
        priorRuns,
        allItems: job.input,
        clock,
      });

      const rawResolved = resolveConfigExpressions(node.config, batchScope);
      const parseRes = def.configSchema.safeParse(rawResolved);
      if (!parseRes.success) {
        throw BitoError(
          'CONFIG_INVALID',
          `Node configuration invalid: ${JSON.stringify(parseRes.error.issues)}`
        );
      }

      if (def.stateful) {
        result = await store.withScratchLock(exec.id, node.id, async (scratchHandle) => {
          ctx.scratch = scratchHandle;
          return await def.execute(ctx, job.input, parseRes.data);
        });
      } else {
        result = await def.execute(ctx, job.input, parseRes.data);
      }
    }

    clearTimeout(timer);

    // 8. Success path
    if (result.wait) {
      await store.finishNodeRun(nodeRun.id, { status: 'WAITING' });
      if ('until' in result.wait) {
        await store.enqueueJobs([
          {
            executionId: exec.id,
            nodeId: node.id,
            nodeRunId: nodeRun.id,
            kind: 'resume',
            inputPort: job.inputPort,
            input: job.input,
            deliveryKey: `${nodeRun.id}:resume`,
            attempt: 1,
            runAt: result.wait.until,
          },
        ]);
      }
      await store.markJobDone?.(job.id);
      await store.tryFinalizeExecution(exec.id);
      return;
    }

    await store.finishNodeRun(nodeRun.id, { status: 'SUCCESS', output: result.outputs });
    await forwardSuccessOutputs(
      store,
      snapshot,
      node,
      nodeRun.id,
      exec.id,
      job.id,
      result.outputs,
      now
    );
  } catch (err: unknown) {
    clearTimeout(timer);
    await handleErrorPath(
      err,
      job,
      node,
      nodeRun.id,
      exec.id,
      def,
      ctx,
      store,
      snapshot as { connections: Parameters<typeof planDeliveries>[0] }
    );
  }
}

async function forwardSuccessOutputs(
  store: ExecutionStore,
  snapshot: { connections: Parameters<typeof planDeliveries>[0] },
  node: WorkflowSnapshotNode,
  nodeRunId: string,
  executionId: string,
  jobId: string,
  outputs: Record<string, Item[]>,
  now: Date
): Promise<void> {
  const deliveries = planDeliveries(snapshot.connections, node.id, outputs);

  const jobsToEnqueue = deliveries.map((d) => ({
    executionId,
    nodeId: d.targetNodeId,
    nodeRunId,
    kind: 'run' as const,
    inputPort: d.targetPort,
    input: d.items,
    deliveryKey: `${nodeRunId}:${d.connectionId}`,
    attempt: 1,
    runAt: now.toISOString(),
  }));

  await store.enqueueJobs(jobsToEnqueue);
  await store.markJobDone?.(jobId);
  await store.tryFinalizeExecution(executionId);
}
