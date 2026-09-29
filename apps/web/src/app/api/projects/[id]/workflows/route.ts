import { z } from 'zod';
import { withRoute } from '../../../../../server/http/withRoute.js';
import { listWorkflows, createWorkflow } from '../../../../../server/repositories/workflows.js';
import { recordAuditLog } from '../../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

export const GET = withRoute(
  {
    auth: true,
    role: 'viewer',
  },
  async ({ user, params }) => {
    const projectId = params.id as string;
    const workflows = await listWorkflows({ userId: user!.id }, projectId);
    return { workflows };
  }
);

const createWorkflowSchema = z.object({
  name: z.string().trim().min(1, 'Workflow name is required').max(100),
  description: z.string().max(500).optional(),
});

export const POST = withRoute(
  {
    auth: true,
    role: 'editor',
    body: createWorkflowSchema,
  },
  async ({ user, params, body, req }) => {
    const projectId = params.id as string;
    const workflow = await createWorkflow({ userId: user!.id }, projectId, {
      name: body.name,
      description: body.description,
    });

    await recordAuditLog({
      userId: user!.id,
      projectId,
      action: 'workflow.create',
      targetType: 'workflow',
      targetId: workflow.id,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: { name: workflow.name },
    });

    return { workflow };
  }
);
