import { z } from 'zod';
import { withRoute } from '../../../../server/http/withRoute.js';
import {
  findWorkflowById,
  updateWorkflow,
  deleteWorkflow,
} from '../../../../server/repositories/workflows.js';
import { recordAuditLog } from '../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

export const GET = withRoute(
  {
    auth: true,
  },
  async ({ user, params }) => {
    const workflowId = params.id as string;
    const workflow = await findWorkflowById({ userId: user!.id }, workflowId);
    return { workflow };
  }
);

const updateWorkflowSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  settings: z.record(z.unknown()).optional(),
});

export const PATCH = withRoute(
  {
    auth: true,
    body: updateWorkflowSchema,
  },
  async ({ user, params, body, req }) => {
    const workflowId = params.id as string;
    const workflow = await updateWorkflow({ userId: user!.id }, workflowId, body);

    await recordAuditLog({
      userId: user!.id,
      projectId: workflow.projectId,
      action: 'workflow.update',
      targetType: 'workflow',
      targetId: workflow.id,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: { name: workflow.name, status: workflow.status },
    });

    return { workflow };
  }
);

export const DELETE = withRoute(
  {
    auth: true,
  },
  async ({ user, params, req }) => {
    const workflowId = params.id as string;
    const workflow = await findWorkflowById({ userId: user!.id }, workflowId);

    await recordAuditLog({
      userId: user!.id,
      projectId: workflow.projectId,
      action: 'workflow.delete',
      targetType: 'workflow',
      targetId: workflowId,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: { name: workflow.name },
    });

    await deleteWorkflow({ userId: user!.id }, workflowId);
    return { ok: true };
  }
);
