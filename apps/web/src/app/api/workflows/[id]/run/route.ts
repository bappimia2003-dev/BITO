import { z } from 'zod';
import { BitoError, type Item, type Json } from '@bito/shared';
import { withRoute } from '../../../../../server/http/withRoute.js';
import { findWorkflowById } from '../../../../../server/repositories/workflows.js';
import { assertProjectRole } from '../../../../../server/auth/rbac.js';
import { startExecution } from '../../../../../server/engine-runtime/startExecution.js';
import { runTick } from '../../../../../server/engine-runtime/runTick.js';
import { recordAuditLog } from '../../../../../server/repositories/audit.js';
import { getDb } from '../../../../../server/db/client.js';

export const runtime = 'nodejs';

const runSchema = z.object({
  triggerNodeId: z.string().uuid().optional(),
  payload: z.unknown().optional(),
});

export const POST = withRoute(
  {
    auth: true,
    body: runSchema,
  },
  async ({ user, params, body, req }) => {
    const workflowId = params.id as string;
    const workflow = await findWorkflowById({ userId: user!.id }, workflowId);
    await assertProjectRole({ userId: user!.id }, workflow.projectId, 'editor');

    let triggerNodeId = body.triggerNodeId;
    if (!triggerNodeId) {
      const sql = getDb();
      const nodeRows = await sql`
        SELECT id, type FROM nodes WHERE workflow_id = ${workflowId} ORDER BY created_at ASC
      `;
      if (nodeRows.length === 0 || !nodeRows[0]) {
        throw BitoError('VALIDATION_FAILED', 'Cannot run workflow with no nodes');
      }
      // Prefer manual trigger or trigger node
      const triggerNode =
        nodeRows.find(
          (n) =>
            n.type === 'manual' ||
            n.type === 'trigger.manual' ||
            (typeof n.type === 'string' &&
              (n.type.startsWith('trigger_') || n.type.startsWith('trigger.')))
        ) ?? nodeRows[0];
      triggerNodeId = triggerNode.id as string;
    }

    let items: Item[] = [{ json: {} }];
    if (body.payload !== undefined && body.payload !== null) {
      if (Array.isArray(body.payload)) {
        items = body.payload.map((p) => {
          if (p && typeof p === 'object' && 'json' in p) {
            return p as Item;
          }
          return { json: (p as Record<string, Json>) ?? {} };
        });
      } else if (typeof body.payload === 'object') {
        const obj = body.payload as Record<string, unknown>;
        if ('json' in obj && typeof obj.json === 'object' && obj.json !== null) {
          items = [obj as unknown as Item];
        } else {
          items = [{ json: obj as Record<string, Json> }];
        }
      }
    }

    const executionId = await startExecution({
      workflowId,
      projectId: workflow.projectId,
      triggerNodeId,
      items,
      mode: 'manual',
    });

    // Advance engine tick immediately for fast feedback
    try {
      await runTick({ budgetMs: 3000 });
    } catch {
      // Background worker will continue processing
    }

    await recordAuditLog({
      userId: user!.id,
      projectId: workflow.projectId,
      action: 'workflow.run',
      targetType: 'execution',
      targetId: executionId,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: { workflowId, executionId, triggerNodeId },
    });

    return { executionId };
  }
);
