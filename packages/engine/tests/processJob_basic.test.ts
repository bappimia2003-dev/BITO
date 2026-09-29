import { describe, it, expect } from 'vitest';
import { createTestFixture } from './helpers/engineTestFixture.js';
import type { WorkflowSnapshot } from '../src/index.js';

describe('Workflow Engine: Core Execution Flows', () => {
  it('executes a sequential workflow: Trigger -> Set -> Noop', async () => {
    const { store, drainQueue } = createTestFixture();
    const versionId = 'v1';

    const snapshot: WorkflowSnapshot = {
      nodes: [
        {
          id: 'n1',
          key: 'manual',
          type: 'trigger.manual',
          name: 'Manual Trigger',
          config: {},
        },
        {
          id: 'n2',
          key: 'set1',
          type: 'data.set',
          name: 'Set Node',
          config: {
            assignments: [
              { name: 'greeting', value: 'Hello {{input.name}}', type: 'string' },
              { name: 'score', value: 100, type: 'number' },
            ],
            keepOnlySet: false,
          },
        },
        {
          id: 'n3',
          key: 'noop1',
          type: 'logic.noop',
          name: 'Noop Node',
          config: {},
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
      workflowId: 'wf-1',
      versionId,
      projectId: 'proj-1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [{ json: { name: 'Alice' } }],
    });

    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { name: 'Alice' } }],
        deliveryKey: 'trigger:0',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    await drainQueue(exec.id);

    const updated = await store.loadExecution(exec.id);
    expect(updated.status).toBe('SUCCESS');
    expect(updated.nodeRunCount).toBe(3);

    // Verify final node run output
    const nodeRuns = await store.loadPriorNodeRuns(exec.id);
    const setRun = nodeRuns.find((r) => r.nodeId === 'n2');
    expect(setRun?.status).toBe('SUCCESS');
    expect(setRun?.output?.['main']?.[0]?.json).toEqual({
      name: 'Alice',
      greeting: 'Hello Alice',
      score: 100,
    });
  });

  it('executes parallel branches: Trigger -> Branch A & Branch B', async () => {
    const { store, drainQueue } = createTestFixture();
    const versionId = 'v-parallel';

    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 'trig', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'branchA',
          type: 'data.set',
          name: 'Branch A',
          config: {
            assignments: [{ name: 'branch', value: 'A', type: 'string' }],
          },
        },
        {
          id: 'n3',
          key: 'branchB',
          type: 'data.set',
          name: 'Branch B',
          config: {
            assignments: [{ name: 'branch', value: 'B', type: 'string' }],
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
        {
          id: 'c2',
          sourceNodeId: 'n1',
          sourcePort: 'main',
          targetNodeId: 'n3',
          targetPort: 'main',
        },
      ],
    };
    store.setSnapshot(versionId, snapshot);

    const exec = await store.createExecution({
      workflowId: 'wf-parallel',
      versionId,
      projectId: 'proj-1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [{ json: { item: 1 } }],
    });

    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { item: 1 } }],
        deliveryKey: 'trigger:0',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    await drainQueue(exec.id);

    const updated = await store.loadExecution(exec.id);
    expect(updated.status).toBe('SUCCESS');
    expect(updated.nodeRunCount).toBe(3);

    const nodeRuns = await store.loadPriorNodeRuns(exec.id);
    const runA = nodeRuns.find((r) => r.nodeId === 'n2');
    const runB = nodeRuns.find((r) => r.nodeId === 'n3');
    expect(runA?.output?.['main']?.[0]?.json).toMatchObject({ branch: 'A' });
    expect(runB?.output?.['main']?.[0]?.json).toMatchObject({ branch: 'B' });
  });

  it('routes items correctly through IF node true and false branches', async () => {
    const { store, drainQueue } = createTestFixture();
    const versionId = 'v-if';

    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 'trig', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'ifNode',
          type: 'logic.if',
          name: 'Check Score',
          config: {
            conditions: [
              {
                left: '{{input.score}}',
                operator: 'gte',
                right: 70,
              },
            ],
            combinator: 'AND',
          },
        },
        {
          id: 'n3',
          key: 'passNode',
          type: 'data.set',
          name: 'Pass Node',
          config: { assignments: [{ name: 'result', value: 'PASS', type: 'string' }] },
        },
        {
          id: 'n4',
          key: 'failNode',
          type: 'data.set',
          name: 'Fail Node',
          config: { assignments: [{ name: 'result', value: 'FAIL', type: 'string' }] },
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
          sourcePort: 'true',
          targetNodeId: 'n3',
          targetPort: 'main',
        },
        {
          id: 'c3',
          sourceNodeId: 'n2',
          sourcePort: 'false',
          targetNodeId: 'n4',
          targetPort: 'main',
        },
      ],
    };
    store.setSnapshot(versionId, snapshot);

    // Run 1: Score 85 -> Pass
    const execPass = await store.createExecution({
      workflowId: 'wf-if',
      versionId,
      projectId: 'proj-1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [{ json: { score: 85 } }],
    });
    await store.enqueueJobs([
      {
        executionId: execPass.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { score: 85 } }],
        deliveryKey: 'trigger:0',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);
    await drainQueue(execPass.id);

    const runsPass = await store.loadPriorNodeRuns(execPass.id);
    expect(runsPass.some((r) => r.nodeId === 'n3')).toBe(true);
    expect(runsPass.some((r) => r.nodeId === 'n4')).toBe(false);

    // Run 2: Score 40 -> Fail
    const execFail = await store.createExecution({
      workflowId: 'wf-if',
      versionId,
      projectId: 'proj-1',
      mode: 'manual',
      triggerNodeId: 'n1',
      triggerPayload: [{ json: { score: 40 } }],
    });
    await store.enqueueJobs([
      {
        executionId: execFail.id,
        nodeId: 'n1',
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { score: 40 } }],
        deliveryKey: 'trigger:0',
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);
    await drainQueue(execFail.id);

    const runsFail = await store.loadPriorNodeRuns(execFail.id);
    expect(runsFail.some((r) => r.nodeId === 'n3')).toBe(false);
    expect(runsFail.some((r) => r.nodeId === 'n4')).toBe(true);
  });
});
