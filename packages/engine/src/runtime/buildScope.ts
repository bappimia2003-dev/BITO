import type { Item, Json } from '@bito/shared';
import type { Clock, Execution, NodeRun, WorkflowSnapshot } from '../index.js';

export interface ScopeOptions {
  execution: Execution;
  snapshot: WorkflowSnapshot;
  priorRuns?: NodeRun[];
  vars?: {
    global?: Record<string, Json>;
    project?: Record<string, Json>;
    workflow?: Record<string, Json>;
    execution?: Record<string, Json>;
  };
  currentItem?: Item;
  allItems?: Item[];
  itemIndex?: number;
  params?: Record<string, unknown>;
  loopState?: { index: number; total: number; batch: number };
  clock?: Clock;
}

export function buildExpressionScope(options: ScopeOptions): Record<string, unknown> {
  const {
    execution,
    snapshot,
    priorRuns = [],
    vars = {},
    currentItem,
    allItems = [],
    itemIndex = 0,
    params,
    loopState,
    clock,
  } = options;

  // Build nodes dictionary
  const nodes: Record<string, { json: Record<string, Json>; items: Array<Record<string, Json>> }> =
    {};

  // Map nodeId to nodeKey for fast lookup
  const nodeIdToKey = new Map<string, string>();
  for (const node of snapshot.nodes) {
    nodeIdToKey.set(node.id, node.key);
  }

  // Iterate prior runs in chronological order so latest successful run overwrites
  for (const run of priorRuns) {
    if (run.status === 'SUCCESS' && run.output) {
      const key = nodeIdToKey.get(run.nodeId) ?? run.nodeKey;
      const portItems: Item[] = run.output['main'] ?? Object.values(run.output)[0] ?? [];

      nodes[key] = {
        json: portItems[0]?.json ?? {},
        items: portItems.map((item) => item.json),
      };
    }
  }

  // Current item and items
  const inputJson = currentItem?.json ?? allItems[0]?.json ?? {};
  const inputsArray = allItems.map((item) => item.json);

  // Trigger scope
  const triggerPayload = execution.triggerPayload ?? [];
  const triggerJson = triggerPayload[0]?.json ?? {};

  const scope: Record<string, unknown> = {
    input: inputJson,
    inputs: inputsArray,
    index: itemIndex,
    trigger: triggerJson,
    nodes,
    vars: {
      global: vars.global ?? {},
      project: vars.project ?? {},
      workflow: vars.workflow ?? {},
      execution: { ...(execution.vars ?? {}), ...(vars.execution ?? {}) },
    },
    execution: {
      id: execution.id,
      workflowId: execution.workflowId,
      projectId: execution.projectId,
    },
    workflow: {
      id: execution.workflowId,
      name: '',
    },
    project: {
      id: execution.projectId,
    },
    now: (clock ? clock.now() : new Date()).toISOString(),
  };

  if (params) {
    scope['param'] = params;
  }

  if (loopState) {
    scope['loop'] = loopState;
  }

  return scope;
}
