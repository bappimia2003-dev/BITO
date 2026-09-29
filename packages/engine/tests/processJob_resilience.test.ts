import { describe, it, expect } from 'vitest';
import {
  BitoError,
  type Item,
  type NodeContext,
  type NodeDefinition,
  type NodeResult,
} from '@bito/shared';
import { createTestFixture } from './helpers/engineTestFixture.js';
import type { WorkflowSnapshot } from '../src/index.js';
import { z } from 'zod';

describe('Workflow Engine: Resilience, Retries, and Error Policies', () => {
  it('retries failed node runs with backoff and succeeds on subsequent attempt', async () => {
    const { store, registry, clock, drainQueue } = createTestFixture();
    const versionId = 'v-retry';

    let attemptsCount = 0;
    const flappyNode: NodeDefinition<Record<string, unknown>> = {
      type: 'test.flappy',
      version: 1,
      name: 'Flappy Node',
      description: 'Fails on first attempt, succeeds on second',
      category: 'UTILITY',
      icon: 'activity',
      inputs: [{ id: 'main', label: 'Main', kind: 'main' }],
      outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
      mode: 'batch',
      fields: [],
      configSchema: z.object({}),
      outputSchema: { type: 'object' },
      credentials: [],
      execute: async (_ctx: NodeContext, items: Item[]): Promise<NodeResult> => {
        attemptsCount++;
        if (attemptsCount === 1) {
          throw BitoError('NETWORK_ERROR', 'Connection reset', { retryable: true });
        }
        return { outputs: { main: items } };
      },
    };
    registry.register(flappyNode as never);

    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 'trig', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'flappy',
          type: 'test.flappy',
          name: 'Flappy',
          config: {},
          settings: {
            retry: { maxAttempts: 3, backoff: 'fixed', delayMs: 1000 },
          },
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'n1',
          sourcePort: 'main',
          targetNodeId: 'n2',
          targetPort: 'main',
        },
      ],
    };
    store.setSnapshot(versionId, snapshot);

    const exec = await store.createExecution({
      workflowId: 'wf-retry',
      versionId,
      projectId: 'p1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [{ json: { foo: 'bar' } }],
    });

    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { foo: 'bar' } }],
        deliveryKey: 'trigger:0',
        attempt: 1,
        runAt: clock.now().toISOString(),
      },
    ]);

    // First drain: trigger succeeds, flappy fails attempt 1 and enqueues attempt 2
    await drainQueue(exec.id);
    expect(attemptsCount).toBe(1);

    const runsAfterAttempt1 = await store.loadPriorNodeRuns(exec.id);
    const failedRun = runsAfterAttempt1.find((r) => r.nodeId === 'n2');
    expect(failedRun?.status).toBe('FAILED');
    expect(failedRun?.error).toMatchObject({ willRetry: true, retryable: true });

    // Advance clock past backoff delay (1000ms + jitter)
    clock.advanceMs(2000);

    // Second drain: executes attempt 2 and succeeds
    await drainQueue(exec.id);
    expect(attemptsCount).toBe(2);

    const finalExec = await store.loadExecution(exec.id);
    expect(finalExec.status).toBe('SUCCESS');
  });

  it('fails execution immediately when onError is "stop"', async () => {
    const { store, drainQueue } = createTestFixture();
    const versionId = 'v-stop';

    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 'trig', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'stopNode',
          type: 'logic.stop',
          name: 'Stop Node',
          config: { message: 'Halted by business rule', errorCode: 'BLOCKED' },
          settings: { onError: 'stop' },
        },
        { id: 'n3', key: 'noop', type: 'logic.noop', name: 'Never Run', config: {} },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'n1',
          sourcePort: 'main',
          targetNodeId: 'n2',
          targetPort: 'main',
        },
        {
          id: 'c2',
          sourceNodeId: 'n2',
          sourcePort: 'main',
          targetNodeId: 'n3',
          targetPort: 'main',
        },
      ],
    };
    store.setSnapshot(versionId, snapshot);

    const exec = await store.createExecution({
      workflowId: 'wf-stop',
      versionId,
      projectId: 'p1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [{ json: {} }],
    });

    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: {} }],
        deliveryKey: 'trigger:0',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    await drainQueue(exec.id);

    const finalExec = await store.loadExecution(exec.id);
    expect(finalExec.status).toBe('FAILED');
    expect(finalExec.error).toMatchObject({
      code: 'STOPPED_BY_USER_LOGIC',
      message: 'Halted by business rule',
      nodeKey: 'stopNode',
    });

    const runs = await store.loadPriorNodeRuns(exec.id);
    expect(runs.some((r) => r.nodeId === 'n3')).toBe(false);
  });

  it('forwards _error on main output when onError is "continue"', async () => {
    const { store, drainQueue } = createTestFixture();
    const versionId = 'v-continue';

    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 'trig', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'failing',
          type: 'logic.stop',
          name: 'Failing Node',
          config: { message: 'Ignored failure', errorCode: 'SOFT_FAIL' },
          settings: { onError: 'continue' },
        },
        {
          id: 'n3',
          key: 'consumer',
          type: 'data.set',
          name: 'Consumer',
          config: { assignments: [] },
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'n1',
          sourcePort: 'main',
          targetNodeId: 'n2',
          targetPort: 'main',
        },
        {
          id: 'c2',
          sourceNodeId: 'n2',
          sourcePort: 'main',
          targetNodeId: 'n3',
          targetPort: 'main',
        },
      ],
    };
    store.setSnapshot(versionId, snapshot);

    const exec = await store.createExecution({
      workflowId: 'wf-cont',
      versionId,
      projectId: 'p1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [{ json: { original: 'data' } }],
    });

    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { original: 'data' } }],
        deliveryKey: 'trigger:0',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    await drainQueue(exec.id);

    const finalExec = await store.loadExecution(exec.id);
    expect(finalExec.status).toBe('SUCCESS');

    const runs = await store.loadPriorNodeRuns(exec.id);
    const consumerRun = runs.find((r) => r.nodeId === 'n3');
    expect(consumerRun?.status).toBe('SUCCESS');
    expect(consumerRun?.output?.['main']?.[0]?.json).toMatchObject({
      original: 'data',
      _error: { code: 'STOPPED_BY_USER_LOGIC', message: 'Ignored failure' },
    });
  });
});
