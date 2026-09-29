import { z } from 'zod';
import { resolveTemplate, type ExpressionScope, type ScopeNodeState } from '@bito/engine';
import type { Json } from '@bito/shared';
import { withRoute } from '../../../../../../server/http/withRoute.js';
import { getWorkflowWithGraph } from '../../../../../../server/repositories/workflowGraph.js';
import {
  listExecutions,
  findExecutionById,
} from '../../../../../../server/repositories/executions.js';
import { listVariables } from '../../../../../../server/repositories/variables.js';

export const runtime = 'nodejs';

const previewBodySchema = z.object({
  expression: z.string(),
  nodeId: z.string().uuid().optional(),
  sampleInput: z.unknown().optional(),
  sampleVars: z.record(z.unknown()).optional(),
});

export const POST = withRoute(
  {
    auth: true,
    body: previewBodySchema,
  },
  async ({ user, params, body }) => {
    const workflowId = params.id as string;
    const actor = { userId: user!.id };

    const graph = await getWorkflowWithGraph(actor, workflowId);
    const variables = await listVariables(actor, {
      scope: 'project',
      projectId: graph.workflow.projectId,
    });

    // Merge system/project variables
    const vars: Record<string, Json> = {};
    for (const v of variables) {
      vars[v.key] = v.value as Json;
    }
    if (body.sampleVars) {
      Object.assign(vars, body.sampleVars as Record<string, Json>);
    }

    // Initialize node states
    const nodesScope: Record<string, ScopeNodeState> = {};
    for (const node of graph.nodes) {
      nodesScope[node.key] = { json: {}, items: [] };
    }

    let inputData: Record<string, Json> = (body.sampleInput as Record<string, Json>) ?? {};
    let triggerData: Record<string, Json> = {};

    try {
      const recentExecs = await listExecutions(
        actor,
        graph.workflow.projectId,
        workflowId,
        undefined,
        1
      );
      if (recentExecs.length > 0 && recentExecs[0]?.id) {
        const detail = await findExecutionById(actor, recentExecs[0].id);
        if (
          detail.execution.triggerPayload &&
          Array.isArray(detail.execution.triggerPayload) &&
          detail.execution.triggerPayload[0]
        ) {
          const item = detail.execution.triggerPayload[0] as { json?: Record<string, Json> };
          triggerData = item.json ?? (detail.execution.triggerPayload[0] as Record<string, Json>);
        }

        for (const run of detail.nodeRuns) {
          if (run.status === 'SUCCESS' && run.output && typeof run.output === 'object') {
            const outRecord = run.output as Record<string, Array<{ json?: Record<string, Json> }>>;
            const mainItems = outRecord['main'] ?? Object.values(outRecord)[0] ?? [];
            nodesScope[run.nodeKey] = {
              json: mainItems[0]?.json ?? {},
              items: mainItems.map((it) => it.json ?? (it as unknown as Record<string, Json>)),
            };

            if (body.nodeId && run.nodeId === body.nodeId && !body.sampleInput) {
              const inItems = (run.input as Array<{ json?: Record<string, Json> }>) ?? [];
              inputData = inItems[0]?.json ?? {};
            }
          }
        }
      }
    } catch {
      // Fallback to sample data
    }

    const scope: ExpressionScope = {
      input: inputData,
      inputs: [inputData],
      index: 0,
      trigger: triggerData,
      nodes: nodesScope,
      vars,
    };

    try {
      const result = resolveTemplate(body.expression, scope);
      return {
        success: true,
        result: (result ?? null) as unknown as Record<string, unknown>,
        error: null,
      };
    } catch (err: unknown) {
      return {
        success: false,
        result: null,
        error: (err as Error).message || 'Expression evaluation error',
      };
    }
  }
);
