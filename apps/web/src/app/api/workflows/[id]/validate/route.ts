import { z } from 'zod';
import { validateGraph, type WorkflowSnapshot } from '@bito/engine';
import { withRoute } from '../../../../../server/http/withRoute.js';
import {
  getWorkflowWithGraph,
  workflowNodeSchema,
  workflowConnectionSchema,
} from '../../../../../server/repositories/workflowGraph.js';
import { listCredentials } from '../../../../../server/repositories/credentials.js';

export const runtime = 'nodejs';

const validateBodySchema = z.object({
  nodes: z.array(workflowNodeSchema).optional(),
  connections: z.array(workflowConnectionSchema).optional(),
});

export const POST = withRoute(
  {
    auth: true,
    body: validateBodySchema,
  },
  async ({ user, params, body }) => {
    const workflowId = params.id as string;
    const current = await getWorkflowWithGraph({ userId: user!.id }, workflowId);

    const nodes = body.nodes ?? current.nodes;
    const connections = body.connections ?? current.connections;

    const credentials = await listCredentials({ userId: user!.id }, current.workflow.projectId);

    const snapshot: WorkflowSnapshot = {
      nodes: nodes.map((n) => ({
        id: n.id,
        key: n.key,
        type: n.type,
        typeVersion: n.typeVersion ?? 1,
        name: n.name,
        config: n.config ?? {},
        credentialId: n.credentialId ?? undefined,
        settings: n.settings ?? {},
      })),
      connections: connections.map((c) => ({
        id: c.id ?? `${c.sourceNodeId}:${c.sourcePort}->${c.targetNodeId}:${c.targetPort}`,
        sourceNodeId: c.sourceNodeId,
        sourcePort: c.sourcePort ?? 'main',
        targetNodeId: c.targetNodeId,
        targetPort: c.targetPort ?? 'main',
      })),
      settings: current.workflow.settings ?? {},
    };

    const issues = validateGraph(snapshot, {
      credentials: credentials.map((c) => ({ id: c.id, type: c.type })),
      projectId: current.workflow.projectId,
    });

    const errorCount = issues.filter((i) => i.severity === 'error').length;
    const warningCount = issues.filter((i) => i.severity === 'warning').length;

    return {
      isValid: errorCount === 0,
      errorCount,
      warningCount,
      issues,
    };
  }
);
