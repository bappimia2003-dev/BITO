import { describe, it, expect } from 'vitest';
import { createTestFixture } from './helpers/engineTestFixture.js';
import type { WorkflowSnapshot } from '../src/index.js';

describe('Workflow Engine: Lifecycle and Wait Flows', () => {
  it('handles Wait node: sets WAITING, enqueues resume job, resumes on clock advance', async () => {
    const { store, clock, drainQueue } = createTestFixture();
    const versionId = 'v-wait';

    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 'trig', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'wait',
          type: 'logic.wait',
          name: 'Wait 10s',
          config: { mode: 'duration', amount: 10, unit: 's' },
        },
        { id: 'n3', key: 'noop', type: 'logic.noop', name: 'Noop', config: {} },
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
      workflowId: 'wf-wait',
      versionId,
      projectId: 'proj-1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [{ json: { ping: true } }],
    });

    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { ping: true } }],
        deliveryKey: 'trigger:0',
        attempt: 1,
        runAt: clock.now().toISOString(),
      },
    ]);

    // First drain: processes trigger and wait node
    await drainQueue(exec.id);

    // State should now be WAITING
    const midway = await store.loadExecution(exec.id);
    expect(midway.status).toBe('WAITING');

    const nodeRuns = await store.loadPriorNodeRuns(exec.id);
    const waitRun = nodeRuns.find((r) => r.nodeId === 'n2');
    expect(waitRun?.status).toBe('WAITING');

    // Advance clock by 11 seconds
    clock.advanceMs(11_000);

    // Second drain: processes the resume job
    await drainQueue(exec.id);

    const completed = await store.loadExecution(exec.id);
    expect(completed.status).toBe('SUCCESS');
    expect(completed.nodeRunCount).toBe(3);
  });

  it('cancels execution and dead-letters queued jobs', async () => {
    const { store } = createTestFixture();
    const versionId = 'v-cancel';

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
      workflowId: 'wf-cancel',
      versionId,
      projectId: 'proj-1',
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

    await store.cancelExecution(exec.id);

    const updated = await store.loadExecution(exec.id);
    expect(updated.status).toBe('CANCELLED');

    const allJobs = Array.from(store.jobs.values()).filter((j) => j.executionId === exec.id);
    expect(allJobs.every((j) => j.status === 'dead')).toBe(true);
  });
});
