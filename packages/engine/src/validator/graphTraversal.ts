import type { WorkflowSnapshotConnection, WorkflowSnapshotNode } from '@bito/shared';

/**
 * Returns a map of nodeId -> Set of upstream nodeIds (transitive ancestors)
 */
export function buildUpstreamMap(
  nodes: WorkflowSnapshotNode[],
  connections: WorkflowSnapshotConnection[]
): Map<string, Set<string>> {
  const incomingMap = new Map<string, string[]>();
  for (const n of nodes) {
    incomingMap.set(n.id, []);
  }
  for (const c of connections) {
    const list = incomingMap.get(c.targetNodeId);
    if (list) {
      list.push(c.sourceNodeId);
    }
  }

  const upstreamMap = new Map<string, Set<string>>();

  function getUpstream(nodeId: string, visited = new Set<string>()): Set<string> {
    if (upstreamMap.has(nodeId)) {
      return upstreamMap.get(nodeId)!;
    }
    const result = new Set<string>();
    visited.add(nodeId);

    const directIncoming = incomingMap.get(nodeId) || [];
    for (const parentId of directIncoming) {
      result.add(parentId);
      if (!visited.has(parentId)) {
        const grandParents = getUpstream(parentId, new Set(visited));
        for (const gp of grandParents) {
          result.add(gp);
        }
      }
    }

    upstreamMap.set(nodeId, result);
    return result;
  }

  for (const n of nodes) {
    getUpstream(n.id);
  }

  return upstreamMap;
}

/**
 * Returns set of all nodeIds reachable from trigger nodes
 */
export function findReachableNodes(
  nodes: WorkflowSnapshotNode[],
  connections: WorkflowSnapshotConnection[],
  triggerNodeIds: Set<string>
): Set<string> {
  const outgoingMap = new Map<string, string[]>();
  for (const n of nodes) {
    outgoingMap.set(n.id, []);
  }
  for (const c of connections) {
    const list = outgoingMap.get(c.sourceNodeId);
    if (list) {
      list.push(c.targetNodeId);
    }
  }

  const reachable = new Set<string>();
  const queue = Array.from(triggerNodeIds);

  for (const id of queue) {
    reachable.add(id);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const targets = outgoingMap.get(current) || [];
    for (const t of targets) {
      if (!reachable.has(t)) {
        reachable.add(t);
        queue.push(t);
      }
    }
  }

  return reachable;
}

/**
 * Detects cycles in the graph that do NOT flow through a ForEach loop port.
 * Returns true if an illegal cycle exists.
 */
export function detectIllegalCycle(
  nodes: WorkflowSnapshotNode[],
  connections: WorkflowSnapshotConnection[]
): { hasCycle: boolean; connectionId?: string } {
  // Build adjacency list ignoring connections into a ForEach 'loop' port
  const adj = new Map<string, Array<{ target: string; connId: string }>>();
  for (const n of nodes) {
    adj.set(n.id, []);
  }

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (const c of connections) {
    const targetNode = nodeMap.get(c.targetNodeId);
    const isForEachLoop = targetNode?.type === 'logic.foreach' && c.targetPort === 'loop';

    // Allow cycle edges only if they enter a ForEach loop port
    if (!isForEachLoop) {
      const list = adj.get(c.sourceNodeId);
      if (list) {
        list.push({ target: c.targetNodeId, connId: c.id });
      }
    }
  }

  // 0 = unvisited, 1 = visiting (on current recursion stack), 2 = visited
  const state = new Map<string, number>();
  for (const n of nodes) {
    state.set(n.id, 0);
  }

  let offendingConnId: string | undefined;

  function dfs(nodeId: string): boolean {
    state.set(nodeId, 1);

    const neighbors = adj.get(nodeId) || [];
    for (const { target, connId } of neighbors) {
      const targetState = state.get(target) ?? 0;
      if (targetState === 1) {
        // Back-edge found -> cycle
        offendingConnId = connId;
        return true;
      }
      if (targetState === 0) {
        if (dfs(target)) return true;
      }
    }

    state.set(nodeId, 2);
    return false;
  }

  for (const n of nodes) {
    if ((state.get(n.id) ?? 0) === 0) {
      if (dfs(n.id)) {
        return { hasCycle: true, connectionId: offendingConnId };
      }
    }
  }

  return { hasCycle: false };
}
