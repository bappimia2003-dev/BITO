import { withRoute } from '../../../../../../../server/http/withRoute.js';
import { findWorkflowById } from '../../../../../../../server/repositories/workflows.js';
import { rotateWebhookTokenAndSecret } from '../../../../../../../server/repositories/webhooks.js';
import { assertProjectRole } from '../../../../../../../server/auth/rbac.js';
import { recordAuditLog } from '../../../../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    auth: true,
  },
  async ({ user, params, req }) => {
    const workflowId = params.id as string;
    const endpointId = params.endpointId as string;

    const workflow = await findWorkflowById({ userId: user!.id }, workflowId);
    await assertProjectRole({ userId: user!.id }, workflow.projectId, 'editor');

    const result = await rotateWebhookTokenAndSecret(endpointId, workflowId);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;

    await recordAuditLog({
      userId: user!.id,
      projectId: workflow.projectId,
      action: 'webhook.rotate_secret',
      targetType: 'webhook_endpoint',
      targetId: endpointId,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });

    return Response.json({ ok: true, ...result });
  }
);
