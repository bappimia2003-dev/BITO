import { describe, it, expect, beforeEach } from 'vitest';
import { validateGraph, type NodeRegistry, type WorkflowSnapshot } from '../src/index.js';
import { createTestRegistry } from './helpers/validatorFixture.js';

describe('Graph Validator Basic Rules (1-8)', () => {
  let registry: NodeRegistry;

  beforeEach(() => {
    registry = createTestRegistry();
  });

  it('1. NO_TRIGGER: raises error when workflow has no trigger nodes', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        {
          id: 'n1',
          key: 'step1',
          type: 'data.transform',
          name: 'Transform',
          config: { requiredField: 'valid' },
          credentialId: 'c1',
        },
      ],
      connections: [],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'NO_TRIGGER' && i.severity === 'error')).toBe(true);
  });

  it('2. NODE_TYPE_UNKNOWN: raises error when node type is not registered', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        {
          id: 'n1',
          key: 't1',
          type: 'trigger.manual',
          name: 'Trigger',
          config: {},
        },
        {
          id: 'n2',
          key: 'unknown',
          type: 'some.nonexistent.type',
          name: 'Unknown',
          config: {},
        },
      ],
      connections: [],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'NODE_TYPE_UNKNOWN' && i.severity === 'error')).toBe(true);
  });

  it('3. CONFIG_INVALID: raises error when zod validation fails on config', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        {
          id: 'n1',
          key: 't1',
          type: 'trigger.manual',
          name: 'Trigger',
          config: {},
        },
        {
          id: 'n2',
          key: 'd1',
          type: 'data.transform',
          name: 'Transform',
          config: { requiredField: '' }, // empty string violates .min(1)
          credentialId: 'c1',
        },
      ],
      connections: [],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'CONFIG_INVALID' && i.severity === 'error')).toBe(true);
  });

  it('4. EXPR_SYNTAX: raises error when an expression has invalid syntax', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        {
          id: 'n1',
          key: 't1',
          type: 'trigger.manual',
          name: 'Trigger',
          config: {},
        },
        {
          id: 'n2',
          key: 'd1',
          type: 'data.transform',
          name: 'Transform',
          config: {
            requiredField: 'ok',
            exprField: '{{ invalid > > syntax }}',
          },
          credentialId: 'c1',
        },
      ],
      connections: [],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'EXPR_SYNTAX' && i.severity === 'error')).toBe(true);
  });

  it('5. EXPR_REF_NOT_UPSTREAM: raises warning when expression references a non-upstream node', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        {
          id: 'n1',
          key: 't1',
          type: 'trigger.manual',
          name: 'Trigger',
          config: {},
        },
        {
          id: 'n2',
          key: 'd1',
          type: 'data.transform',
          name: 'Transform 1',
          config: {
            requiredField: 'ok',
            exprField: '{{ nodes.d2.json.foo }}', // d2 is NOT upstream!
          },
          credentialId: 'c1',
        },
        {
          id: 'n3',
          key: 'd2',
          type: 'data.transform',
          name: 'Transform 2',
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
      ],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'EXPR_REF_NOT_UPSTREAM' && i.severity === 'warning')).toBe(
      true
    );
  });

  it('6. CREDENTIAL_MISSING: raises error when required credential is not assigned', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        {
          id: 'n1',
          key: 't1',
          type: 'trigger.manual',
          name: 'Trigger',
          config: {},
        },
        {
          id: 'n2',
          key: 'd1',
          type: 'data.transform',
          name: 'Transform',
          config: { requiredField: 'ok' },
        },
      ],
      connections: [],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'CREDENTIAL_MISSING' && i.severity === 'error')).toBe(
      true
    );
  });

  it('7. CREDENTIAL_TYPE_MISMATCH: raises error when assigned credential type does not match requirement', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        {
          id: 'n1',
          key: 't1',
          type: 'trigger.manual',
          name: 'Trigger',
          config: {},
        },
        {
          id: 'n2',
          key: 'd1',
          type: 'data.transform',
          name: 'Transform',
          config: { requiredField: 'ok' },
          credentialId: 'wrong_cred',
        },
      ],
      connections: [],
      settings: {},
    };

    const issues = validateGraph(snapshot, {
      registry,
      credentials: [{ id: 'wrong_cred', type: 'geminiApiKey', projectId: 'p1' }],
    });
    expect(
      issues.some((i) => i.code === 'CREDENTIAL_TYPE_MISMATCH' && i.severity === 'error')
    ).toBe(true);
  });

  it('8. PORT_INVALID: raises error when connection references nonexistent port', () => {
    const snapshot: WorkflowSnapshot = {
      nodes: [
        {
          id: 'n1',
          key: 't1',
          type: 'trigger.manual',
          name: 'Trigger',
          config: {},
        },
        {
          id: 'n2',
          key: 'd1',
          type: 'data.transform',
          name: 'Transform',
          config: { requiredField: 'ok' },
          credentialId: 'c1',
        },
      ],
      connections: [
        {
          id: 'c1',
          sourceNodeId: 'n1',
          sourcePort: 'invalid_output_port',
          targetNodeId: 'n2',
          targetPort: 'main',
        },
      ],
      settings: {},
    };

    const issues = validateGraph(snapshot, { registry });
    expect(issues.some((i) => i.code === 'PORT_INVALID' && i.severity === 'error')).toBe(true);
  });
});
