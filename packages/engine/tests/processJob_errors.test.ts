import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  BitoError,
  type Item,
  type NodeContext,
  type NodeDefinition,
  type NodeResult,
} from '@bito/shared';
import { createTestFixture } from './helpers/engineTestFixture.js';
import type { WorkflowSnapshot } from '../src/index.js';

describe('Workflow Engine: Error Routing & Safety Limits', () => {
  it('routes to error output port when onError is "errorPort"', async () => {
    const { store, drainQueue } = createTestFixture();
    const versionId = 'v-err-port';

    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 'trig', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'failing',
          type: 'logic.stop',
          name: 'Failing Node',
          config: { message: 'Captured error' },
          settings: { onError: 'errorPort' },
        },
        {
          id: 'n3',
          key: 'errorHandler',
          type: 'data.set',
          name: 'Error Handler',
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
          sourcePort: 'error',
          targetNodeId: 'n3',
          targetPort: 'main',
        },
      ],
    };
    store.setSnapshot(versionId, snapshot);

    const exec = await store.createExecution({
      workflowId: 'wf-err-port',
      versionId,
      projectId: 'p1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [{ json: { id: 123 } }],
    });

    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { id: 123 } }],
        deliveryKey: 'trigger:0',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    await drainQueue(exec.id);

    const finalExec = await store.loadExecution(exec.id);
    expect(finalExec.status).toBe('SUCCESS');

    const runs = await store.loadPriorNodeRuns(exec.id);
    const handlerRun = runs.find((r) => r.nodeId === 'n3');
    expect(handlerRun?.status).toBe('SUCCESS');
    expect(handlerRun?.output?.['main']?.[0]?.json).toMatchObject({
      input: { id: 123 },
      error: { code: 'STOPPED_BY_USER_LOGIC', message: 'Captured error', nodeKey: 'failing' },
    });
  });

  it('enforces maxNodeRuns safety cap', async () => {
    const { store } = createTestFixture();
    const versionId = 'v-cap';

    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 'trig', type: 'trigger.manual', name: 'Trigger', config: {} },
        { id: 'n2', key: 'noop', type: 'logic.noop', name: 'Noop', config: {} },
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
      workflowId: 'wf-cap',
      versionId,
      projectId: 'p1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [{ json: {} }],
    });

    // Simulate execution having already reached the cap of 1
    exec.nodeRunCount = 1;

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

    // Process job with maxNodeRuns = 1
    const jobs = await store.claimJobs('w1', 1, 60_000);
    const { registry, http, resolver, clock } = createTestFixture();
    const { processJob } = await import('../src/runtime/processJob.js');

    await processJob(jobs[0]!, {
      store,
      registry,
      http,
      credentialResolver: resolver,
      clock,
      maxNodeRuns: 1,
    });

    const updated = await store.loadExecution(exec.id);
    expect(updated.status).toBe('FAILED');
    expect(updated.error).toMatchObject({ code: 'MAX_NODE_RUNS_EXCEEDED' });
  });

  it('skips already completed items in perItem mode on retry', async () => {
    const { store, registry, clock, drainQueue } = createTestFixture();
    const versionId = 'v-per-item';

    const processedItems: string[] = [];
    let shouldFail = true;

    const flakyItemNode: NodeDefinition<Record<string, unknown>> = {
      type: 'test.flakyItem',
      version: 1,
      name: 'Flaky Item',
      description: 'Fails on third item',
      category: 'UTILITY',
      icon: 'list',
      inputs: [{ id: 'main', label: 'Main', kind: 'main' }],
      outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
      mode: 'perItem',
      fields: [],
      configSchema: z.object({}),
      outputSchema: { type: 'object' },
      credentials: [],
      execute: async (_ctx: NodeContext, items: Item[]): Promise<NodeResult> => {
        const item = items[0]!;
        const name = String(item.json['name']);
        processedItems.push(name);
        if (name === 'item3' && shouldFail) {
          shouldFail = false; // Next time it won't fail
          throw BitoError('ITEM_ERROR', 'Item 3 failed', { retryable: true });
        }
        return { outputs: { main: items } };
      },
    };
    registry.register(flakyItemNode as never);

    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 'trig', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'itemNode',
          type: 'test.flakyItem',
          name: 'Item Node',
          config: {},
          settings: { retry: { maxAttempts: 2, backoff: 'fixed', delayMs: 500 } },
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
      workflowId: 'wf-items',
      versionId,
      projectId: 'p1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [
        { json: { name: 'item1' } },
        { json: { name: 'item2' } },
        { json: { name: 'item3' } },
      ],
    });

    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [
          { json: { name: 'item1' } },
          { json: { name: 'item2' } },
          { json: { name: 'item3' } },
        ],
        deliveryKey: 'trigger:0',
        attempt: 1,
        runAt: clock.now().toISOString(),
      },
    ]);

    // Attempt 1: processes item1, item2, fails at item3
    await drainQueue(exec.id);
    expect(processedItems).toEqual(['item1', 'item2', 'item3']);

    // Advance clock past retry delay
    clock.advanceMs(1000);

    // Attempt 2: skips item1 and item2! Only processes item3!
    await drainQueue(exec.id);
    expect(processedItems).toEqual(['item1', 'item2', 'item3', 'item3']);

    const finalExec = await store.loadExecution(exec.id);
    expect(finalExec.status).toBe('SUCCESS');
  });
});
