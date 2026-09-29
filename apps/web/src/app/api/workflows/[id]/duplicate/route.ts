import { withRoute } from '../../../../../server/http/withRoute.js';
import { duplicateWorkflow } from '../../../../../server/repositories/workflows.js';
import { recordAuditLog } from '../../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    auth: true,
  },
  async ({ user, params, req }) => {
    const workflowId = params.id as string;
    const duplicated = await duplicateWorkflow({ userId: user!.id }, workflowId);

    await recordAuditLog({
      userId: user!.id,
      projectId: duplicated.projectId,
      action: 'workflow.duplicate',
      targetType: 'workflow',
      targetId: duplicated.id,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: { originalWorkflowId: workflowId, name: duplicated.name },
    });

    return { workflow: duplicated };
  }
);
