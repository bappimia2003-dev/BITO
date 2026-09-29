import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryExecutionStore } from '../src/index.js';
import { BitoError } from '@bito/shared';

describe('InMemoryExecutionStore Tests', () => {
  let store: InMemoryExecutionStore;

  beforeEach(() => {
    store = new InMemoryExecutionStore();
  });

  it('creates execution and loads it', async () => {
    const exec = await store.createExecution({
      workflowId: 'wf-1',
      versionId: 'ver-1',
      projectId: 'proj-1',
      mode: 'manual',
    });

    expect(exec.id).toBeDefined();
    expect(exec.status).toBe('QUEUED');

    const loaded = await store.loadExecution(exec.id);
    expect(loaded.workflowId).toBe('wf-1');
  });

  it('throws NOT_FOUND when loading nonexistent execution', async () => {
    await expect(store.loadExecution('nonexistent')).rejects.toThrowError(BitoError);
  });

  it('saves and loads snapshot', async () => {
    const snap = {
      nodes: [{ id: 'n1', key: 'k1', type: 'trigger.manual', name: 'Start', config: {} }],
      connections: [],
      settings: {},
    };
    store.setSnapshot('ver-100', snap);
    const loaded = await store.loadSnapshot('ver-100');
    expect(loaded.nodes[0]!.key).toBe('k1');
  });

  it('enqueues jobs and claims them by worker', async () => {
    const exec = await store.createExecution({
      workflowId: 'wf-1',
      versionId: 'ver-1',
      projectId: 'proj-1',
      mode: 'manual',
    });

    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { msg: 'first' } }],
        deliveryKey: 'del-1',
        attempt: 1,
        runAt: new Date(Date.now() - 5000).toISOString(), // due in the past
      },
      {
        executionId: exec.id,
        nodeId: 'n2',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { msg: 'second' } }],
        deliveryKey: 'del-2',
        attempt: 1,
        runAt: new Date(Date.now() + 60000).toISOString(), // due in the future
      },
    ]);

    const claimed = await store.claimJobs('worker-A', 5, 10000);
    expect(claimed).toHaveLength(1);
    expect(claimed[0]!.nodeId).toBe('n1');
    expect(claimed[0]!.status).toBe('running');
    expect(claimed[0]!.lockedBy).toBe('worker-A');
  });

  it('idempotently skips enqueuing duplicate delivery_keys', async () => {
    await store.enqueueJobs([
      {
        executionId: 'exec-1',
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [],
        deliveryKey: 'del-duplicate',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    expect(store.jobs.size).toBe(1);

    await store.enqueueJobs([
      {
        executionId: 'exec-1',
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [],
        deliveryKey: 'del-duplicate',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    expect(store.jobs.size).toBe(1); // Not duplicated
  });

  it('reclaims stale jobs whose lease expired', async () => {
    await store.enqueueJobs([
      {
        executionId: 'exec-1',
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [],
        deliveryKey: 'del-1',
        attempt: 1,
        runAt: new Date(Date.now() - 10000).toISOString(),
      },
    ]);

    const claimed = await store.claimJobs('worker-1', 1, 1000);
    const job = claimed[0]!;
    job.lockedUntil = new Date(Date.now() - 1000).toISOString(); // simulate expired lease

    const reclaimedCount = await store.reclaimStaleJobs();
    expect(reclaimedCount).toBe(1);
    expect(job.status).toBe('ready');
    expect(job.reclaimCount).toBe(1);
  });

  it('marks job dead after 5 failed reclaims', async () => {
    await store.enqueueJobs([
      {
        executionId: 'exec-1',
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [],
        deliveryKey: 'del-1',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    const claimed = await store.claimJobs('worker-1', 1, 1000);
    const job = claimed[0]!;
    job.reclaimCount = 5;
    job.lockedUntil = new Date(Date.now() - 1000).toISOString();

    const reclaimedCount = await store.reclaimStaleJobs();
    expect(reclaimedCount).toBe(0);
    expect(job.status).toBe('dead');
  });

  it('starts and finishes node runs', async () => {
    const exec = await store.createExecution({
      workflowId: 'wf-1',
      versionId: 'ver-1',
      projectId: 'proj-1',
      mode: 'manual',
    });

    const job = {
      id: 'job-1',
      executionId: exec.id,
      nodeId: 'node-1',
      kind: 'run' as const,
      inputPort: 'main',
      input: [{ json: { foo: 'bar' } }],
      deliveryKey: 'del-1',
      attempt: 1,
      reclaimCount: 0,
      status: 'running' as const,
      runAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    const nodeRun = await store.startNodeRun(job);
    expect(nodeRun.id).toBeDefined();
    expect(nodeRun.status).toBe('RUNNING');

    const updatedExec = await store.loadExecution(exec.id);
    expect(updatedExec.status).toBe('RUNNING');
    expect(updatedExec.nodeRunCount).toBe(1);

    await store.finishNodeRun(nodeRun.id, {
      status: 'SUCCESS',
      output: { main: [{ json: { success: true } }] },
    });

    const nr = store.nodeRuns.get(nodeRun.id)!;
    expect(nr.status).toBe('SUCCESS');
    expect(nr.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('manages scratch state under withScratchLock', async () => {
    const result = await store.withScratchLock('exec-1', 'node-1', async (handle) => {
      expect(await handle.get()).toBeNull();
      await handle.set({ counter: 10 });
      return 10;
    });

    expect(result).toBe(10);

    await store.withScratchLock('exec-1', 'node-1', async (handle) => {
      const val = (await handle.get()) as { counter: number };
      expect(val.counter).toBe(10);
    });
  });

  it('finalizes execution and handles cancel', async () => {
    const exec = await store.createExecution({
      workflowId: 'wf-1',
      versionId: 'ver-1',
      projectId: 'proj-1',
      mode: 'manual',
    });

    const finalized = await store.tryFinalizeExecution(exec.id);
    expect(finalized).toBe('SUCCESS');

    await store.cancelExecution(exec.id);
    // Already in terminal status SUCCESS, remains SUCCESS
    expect((await store.loadExecution(exec.id)).status).toBe('SUCCESS');

    // Test cancelling non-terminal execution with ready jobs and waiting node runs
    const exec2 = await store.createExecution({
      workflowId: 'wf-1',
      versionId: 'ver-1',
      projectId: 'proj-1',
      mode: 'manual',
    });

    await store.enqueueJobs([
      {
        executionId: exec2.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [],
        deliveryKey: 'del-cancelling',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    const nr = await store.startNodeRun({
      id: 'job-cancel-test',
      executionId: exec2.id,
      nodeId: 'n2',
      kind: 'run',
      inputPort: 'main',
      input: [],
      deliveryKey: 'del-wait',
      attempt: 1,
      reclaimCount: 0,
      status: 'ready',
      runAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    await store.finishNodeRun(nr.id, { status: 'WAITING' });

    for (const j of store.jobs.values()) {
      if (j.executionId === exec2.id) j.status = 'done';
    }

    // tryFinalizeExecution returns WAITING when node runs are waiting and no active jobs remain
    const waitFinalize = await store.tryFinalizeExecution(exec2.id);
    expect(waitFinalize).toBe('WAITING');

    await store.cancelExecution(exec2.id);
    expect((await store.loadExecution(exec2.id)).status).toBe('CANCELLED');
    expect(store.nodeRuns.get(nr.id)!.status).toBe('CANCELLED');

    // appendLog and setExecutionStatus with error
    await store.appendLog({ message: 'test log' });
    expect(store.logs).toHaveLength(1);

    const exec3 = await store.createExecution({
      workflowId: 'wf-3',
      versionId: 'ver-3',
      projectId: 'proj-3',
      mode: 'manual',
    });
    await store.setExecutionStatus(exec3.id, 'FAILED', { message: 'Failure details' });
    const loaded3 = await store.loadExecution(exec3.id);
    expect(loaded3.status).toBe('FAILED');
    expect(loaded3.error).toEqual({ message: 'Failure details' });
  });
});
