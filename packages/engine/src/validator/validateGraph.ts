import type {
  Issue,
  WorkflowSnapshot,
  WorkflowSnapshotConnection,
  WorkflowSnapshotNode,
} from '@bito/shared';
import { defaultNodeRegistry, type NodeRegistry } from '../registry/nodeRegistry.js';
import { extractReferences, validateExpressionSyntax } from '../expressions/template.js';
import { buildUpstreamMap, detectIllegalCycle, findReachableNodes } from './graphTraversal.js';

export interface ValidateGraphOptions {
  registry?: NodeRegistry;
  credentials?: Array<{ id: string; type: string; projectId?: string }>;
  projectId?: string;
}

export function validateGraph(
  snapshot: WorkflowSnapshot,
  options: ValidateGraphOptions = {}
): Issue[] {
  const issues: Issue[] = [];
  const registry = options.registry ?? defaultNodeRegistry;
  const nodes = snapshot.nodes || [];
  const connections = snapshot.connections || [];

  const nodeMap = new Map<string, WorkflowSnapshotNode>();
  const keyMap = new Map<string, WorkflowSnapshotNode>();
  const triggerNodeIds = new Set<string>();

  // 1. DUPLICATE_KEY & NODE_TYPE_UNKNOWN & Basic Setup
  for (const node of nodes) {
    nodeMap.set(node.id, node);

    if (keyMap.has(node.key)) {
      issues.push({
        severity: 'error',
        code: 'DUPLICATE_KEY',
        message: `Duplicate node key '${node.key}'`,
        nodeKey: node.key,
      });
    } else {
      keyMap.set(node.key, node);
    }

    const def = registry.get(node.type);
    if (!def) {
      issues.push({
        severity: 'error',
        code: 'NODE_TYPE_UNKNOWN',
        message: `Unknown node type '${node.type}'`,
        nodeKey: node.key,
      });
    } else {
      const isTrigger = def.category === 'TRIGGERS' || def.inputs.length === 0;
      if (isTrigger) {
        triggerNodeIds.add(node.id);
      }
    }
  }

  // 2. NO_TRIGGER check
  if (triggerNodeIds.size === 0) {
    issues.push({
      severity: 'error',
      code: 'NO_TRIGGER',
      message: 'Workflow must have at least one trigger node',
    });
  }

  // 3. TRIGGER_CONFLICT check
  const webhookPaths = new Map<string, string>();
  for (const node of nodes) {
    if (node.type === 'trigger.webhook') {
      const path = (node.config as { path?: string })?.path || 'default';
      if (webhookPaths.has(path)) {
        issues.push({
          severity: 'error',
          code: 'TRIGGER_CONFLICT',
          message: `Webhook triggers '${webhookPaths.get(path)}' and '${node.key}' conflict on path '${path}'`,
          nodeKey: node.key,
        });
      } else {
        webhookPaths.set(path, node.key);
      }
    }
  }

  // 4. Upstream map for expression and reference checking
  const upstreamMap = buildUpstreamMap(nodes, connections);

  // 5. Per-node checks: CONFIG_INVALID, EXPR_SYNTAX, EXPR_REF_NOT_UPSTREAM, CREDENTIALS
  for (const node of nodes) {
    const def = registry.get(node.type);
    if (!def) continue;

    // Config validation via zod
    const parseResult = def.configSchema.safeParse(node.config || {});
    if (!parseResult.success) {
      for (const err of parseResult.error.issues) {
        issues.push({
          severity: 'error',
          code: 'CONFIG_INVALID',
          message: err.message,
          nodeKey: node.key,
          field: err.path.join('.'),
        });
      }
    }

    // Expression syntax & upstream references in string configs
    validateConfigExpressions(node, upstreamMap, keyMap, issues);

    // Credential checks
    if (def.credentials && def.credentials.length > 0) {
      for (const credRequirement of def.credentials) {
        if (credRequirement.required && !node.credentialId) {
          issues.push({
            severity: 'error',
            code: 'CREDENTIAL_MISSING',
            message: `Node '${node.key}' requires a ${credRequirement.type} credential`,
            nodeKey: node.key,
          });
        } else if (node.credentialId && options.credentials) {
          const matchingCred = options.credentials.find((c) => c.id === node.credentialId);
          if (
            !matchingCred ||
            matchingCred.type !== credRequirement.type ||
            (options.projectId &&
              matchingCred.projectId &&
              matchingCred.projectId !== options.projectId)
          ) {
            issues.push({
              severity: 'error',
              code: 'CREDENTIAL_TYPE_MISMATCH',
              message: `Credential on node '${node.key}' does not match expected type '${credRequirement.type}'`,
              nodeKey: node.key,
            });
          }
        }
      }
    }

    // Custom node validate hook
    if (def.validate) {
      const customIssues = def.validate(node.config as never, { nodes, connections });
      for (const ci of customIssues) {
        issues.push(ci);
      }
    }
  }

  // 6. Connection and Port validation
  validateConnections(nodes, connections, registry, nodeMap, issues);

  // 7. Cycle detection: CYCLE_NOT_ALLOWED
  const cycleResult = detectIllegalCycle(nodes, connections);
  if (cycleResult.hasCycle) {
    issues.push({
      severity: 'error',
      code: 'CYCLE_NOT_ALLOWED',
      message: 'Cycle detected in graph outside of ForEach loop port',
      connectionId: cycleResult.connectionId,
    });
  }

  // 8. Reachability check: UNREACHABLE_NODE
  if (triggerNodeIds.size > 0) {
    const reachable = findReachableNodes(nodes, connections, triggerNodeIds);
    for (const node of nodes) {
      if (!triggerNodeIds.has(node.id) && !reachable.has(node.id)) {
        issues.push({
          severity: 'warning',
          code: 'UNREACHABLE_NODE',
          message: `Node '${node.key}' is not reachable from any trigger`,
          nodeKey: node.key,
        });
      }
    }
  }

  // 9. Merge and convergence checks: MERGE_NEEDS_TWO_INPUTS & CONVERGENCE_WITHOUT_MERGE
  validateMergeAndConvergence(nodes, connections, issues);

  // 10. ForEach loop target check: FOREACH_LOOP_TARGET
  validateForEachLoopTargets(nodes, connections, issues);

  return issues;
}

function validateConfigExpressions(
  node: WorkflowSnapshotNode,
  upstreamMap: Map<string, Set<string>>,
  keyMap: Map<string, WorkflowSnapshotNode>,
  issues: Issue[]
): void {
  const upstreamNodeIds = upstreamMap.get(node.id) || new Set<string>();

  function walk(val: unknown, path: string): void {
    if (typeof val === 'string') {
      if (val.includes('{{')) {
        const regex = /(?<!\\)\{\{([\s\S]+?)\}\}/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(val)) !== null) {
          const expr = match[1]!;
          const check = validateExpressionSyntax(expr);
          if (!check.valid) {
            issues.push({
              severity: 'error',
              code: 'EXPR_SYNTAX',
              message: check.error?.message || 'Invalid expression syntax',
              nodeKey: node.key,
              field: path,
            });
          }
        }

        const refs = extractReferences(val);
        for (const refKey of refs) {
          const targetNode = keyMap.get(refKey);
          if (targetNode && !upstreamNodeIds.has(targetNode.id)) {
            issues.push({
              severity: 'warning',
              code: 'EXPR_REF_NOT_UPSTREAM',
              message: `Expression references node '${refKey}' which is not upstream of '${node.key}'`,
              nodeKey: node.key,
              field: path,
            });
          }
        }
      }
    } else if (val && typeof val === 'object') {
      for (const [k, v] of Object.entries(val)) {
        walk(v, path ? `${path}.${k}` : k);
      }
    }
  }

  walk(node.config, '');
}

function validateConnections(
  nodes: WorkflowSnapshotNode[],
  connections: WorkflowSnapshotConnection[],
  registry: NodeRegistry,
  nodeMap: Map<string, WorkflowSnapshotNode>,
  issues: Issue[]
): void {
  for (const conn of connections) {
    const sourceNode = nodeMap.get(conn.sourceNodeId);
    const targetNode = nodeMap.get(conn.targetNodeId);

    if (!sourceNode || !targetNode) {
      issues.push({
        severity: 'error',
        code: 'PORT_INVALID',
        message: 'Connection references nonexistent node',
        connectionId: conn.id,
      });
      continue;
    }

    const sourceDef = registry.get(sourceNode.type);
    const targetDef = registry.get(targetNode.type);

    if (sourceDef) {
      const validSourcePorts = new Set(sourceDef.outputs.map((p) => p.id));
      if (sourceNode.settings?.onError === 'errorPort') {
        validSourcePorts.add('error');
      }
      if (!validSourcePorts.has(conn.sourcePort)) {
        issues.push({
          severity: 'error',
          code: 'PORT_INVALID',
          message: `Invalid output port '${conn.sourcePort}' on node '${sourceNode.key}'`,
          nodeKey: sourceNode.key,
          connectionId: conn.id,
        });
      }
    }

    if (targetDef) {
      const validTargetPorts = new Set(targetDef.inputs.map((p) => p.id));
      if (!validTargetPorts.has(conn.targetPort)) {
        issues.push({
          severity: 'error',
          code: 'PORT_INVALID',
          message: `Invalid input port '${conn.targetPort}' on node '${targetNode.key}'`,
          nodeKey: targetNode.key,
          connectionId: conn.id,
        });
      }
    }
  }
}

function validateMergeAndConvergence(
  nodes: WorkflowSnapshotNode[],
  connections: WorkflowSnapshotConnection[],
  issues: Issue[]
): void {
  const incomingCount = new Map<string, number>();
  for (const n of nodes) {
    incomingCount.set(n.id, 0);
  }
  for (const c of connections) {
    incomingCount.set(c.targetNodeId, (incomingCount.get(c.targetNodeId) || 0) + 1);
  }

  for (const node of nodes) {
    const count = incomingCount.get(node.id) || 0;
    if (node.type === 'logic.merge') {
      if (count < 2) {
        issues.push({
          severity: 'error',
          code: 'MERGE_NEEDS_TWO_INPUTS',
          message: `Merge node '${node.key}' requires at least 2 connected inputs (found ${count})`,
          nodeKey: node.key,
        });
      }
    } else {
      if (count > 1) {
        issues.push({
          severity: 'warning',
          code: 'CONVERGENCE_WITHOUT_MERGE',
          message: `Node '${node.key}' has multiple incoming connections without a Merge node`,
          nodeKey: node.key,
        });
      }
    }
  }
}

function validateForEachLoopTargets(
  nodes: WorkflowSnapshotNode[],
  connections: WorkflowSnapshotConnection[],
  issues: Issue[]
): void {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  // Find all connections into a ForEach loop port
  for (const conn of connections) {
    const targetNode = nodeMap.get(conn.targetNodeId);
    if (targetNode?.type === 'logic.foreach' && conn.targetPort === 'loop') {
      // Must originate downstream of this ForEach's 'each' port
      const downstreamOfEach = new Set<string>();
      const queue: string[] = [];

      for (const c of connections) {
        if (c.sourceNodeId === targetNode.id && c.sourcePort === 'each') {
          downstreamOfEach.add(c.targetNodeId);
          queue.push(c.targetNodeId);
        }
      }

      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (const c of connections) {
          if (c.sourceNodeId === curr && !downstreamOfEach.has(c.targetNodeId)) {
            downstreamOfEach.add(c.targetNodeId);
            queue.push(c.targetNodeId);
          }
        }
      }

      if (!downstreamOfEach.has(conn.sourceNodeId)) {
        issues.push({
          severity: 'error',
          code: 'FOREACH_LOOP_TARGET',
          message: `Loop connection into ForEach '${targetNode.key}' must originate downstream of its 'each' port`,
          connectionId: conn.id,
          nodeKey: targetNode.key,
        });
      }
    }
  }
}
