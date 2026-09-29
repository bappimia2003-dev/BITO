import { describe, it, expect, beforeEach } from 'vitest';
import { validateGraph, type NodeRegistry, type WorkflowSnapshot } from '../src/index.js';
import { createTestRegistry } from './helpers/validatorFixture.js';

describe('Graph Validator Advanced Rules (9-16)', () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
  });

  it('9. CYCLE_NOT_ALLOWED: raises error when graph has an illegal cycle', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 't1', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'd1',
          type: 'data.transform',
          name: 'Trans1',
          config: { requiredField: 'ok' },
          credentialId: 'c1',
        },
        {
          id: 'n3',
          key: 'd2',
          type: 'data.transform',
          name: 'Trans2',
          config: { requiredField: 'ok' },
          credentialId: 'c1',
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
        {
          id: 'c3',
          sourceNodeId: 'n3',
          sourcePort: 'main',
          targetNodeId: 'n2',
          targetPort: 'main',
        }, // ILLEGAL CYCLE!
      ],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'CYCLE_NOT_ALLOWED' && i.severity === 'error')).toBe(true);
  });

  it('10. UNREACHABLE_NODE: raises warning when a node is disconnected from triggers', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 't1', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'd1',
          type: 'data.transform',
          name: 'Trans1',
          config: { requiredField: 'ok' },
          credentialId: 'c1',
        },
        {
          id: 'n3',
          key: 'd2_isolated',
          type: 'data.transform',
          name: 'Isolated',
          config: { requiredField: 'ok' },
          credentialId: 'c1',
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
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'UNREACHABLE_NODE' && i.severity === 'warning')).toBe(
      true
    );
  });

  it('11. MERGE_NEEDS_TWO_INPUTS: raises error when Merge node has fewer than 2 incoming edges', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 't1', type: 'trigger.manual', name: 'Trigger', config: {} },
        { id: 'n2', key: 'm1', type: 'logic.merge', name: 'Merge', config: {} },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'n1',
          sourcePort: 'main',
          targetNodeId: 'n2',
          targetPort: 'in_1',
        },
      ],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'MERGE_NEEDS_TWO_INPUTS' && i.severity === 'error')).toBe(
      true
    );
  });

  it('12. CONVERGENCE_WITHOUT_MERGE: raises warning when multiple branches hit a normal node', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 't1', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'd1',
          type: 'data.transform',
          name: 'Trans1',
          config: { requiredField: 'ok' },
          credentialId: 'c1',
        },
        {
          id: 'n3',
          key: 'target_node',
          type: 'data.transform',
          name: 'Converged',
          config: { requiredField: 'ok' },
          credentialId: 'c1',
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'n1',
          sourcePort: 'main',
          targetNodeId: 'n3',
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
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(
      issues.some((i) => i.code === 'CONVERGENCE_WITHOUT_MERGE' && i.severity === 'warning')
    ).toBe(true);
  });

  it('13. DUPLICATE_KEY: raises error when two nodes share the same key', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 'dup_key', type: 'trigger.manual', name: 'Trigger', config: {} },
        {
          id: 'n2',
          key: 'dup_key',
          type: 'data.transform',
          name: 'Trans',
          config: { requiredField: 'ok' },
          credentialId: 'c1',
        },
      ],
      connections: [],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'DUPLICATE_KEY' && i.severity === 'error')).toBe(true);
  });

  it('14. TRIGGER_CONFLICT: raises error when two webhooks share identical path', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        {
          id: 'n1',
          key: 'wh1',
          type: 'trigger.webhook',
          name: 'WH 1',
          config: { path: 'same-path' },
        },
        {
          id: 'n2',
          key: 'wh2',
          type: 'trigger.webhook',
          name: 'WH 2',
          config: { path: 'same-path' },
        },
      ],
      connections: [],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'TRIGGER_CONFLICT' && i.severity === 'error')).toBe(true);
  });

  it('15. FOREACH_LOOP_TARGET: raises error when loop connection does not originate downstream of each port', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 't1', type: 'trigger.manual', name: 'Trigger', config: {} },
        { id: 'n2', key: 'loop1', type: 'logic.foreach', name: 'ForEach', config: {} },
        {
          id: 'n3',
          key: 'external_node',
          type: 'data.transform',
          name: 'External',
          config: { requiredField: 'ok' },
          credentialId: 'c1',
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
        // n3 is not connected to n2's each port, but feeds into n2's loop port!
        {
          id: 'c2',
          sourceNodeId: 'n3',
          sourcePort: 'main',
          targetNodeId: 'n2',
          targetPort: 'loop',
        },
      ],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'FOREACH_LOOP_TARGET' && i.severity === 'error')).toBe(
      true
    );
  });

  it('16. Custom node validate hook: appends custom issues', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        { id: 'n1', key: 't1', type: 'trigger.manual', name: 'Trigger', config: {} },
        { id: 'n2', key: 'cust1', type: 'custom.rule', name: 'Custom Node', config: {} },
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
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'CUSTOM_NODE_WARNING')).toBe(true);
  });
});
