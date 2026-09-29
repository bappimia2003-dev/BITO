import { withRoute } from '../../../../../server/http/withRoute.js';
import { findWorkflowById } from '../../../../../server/repositories/workflows.js';
import { listWebhooksForWorkflow } from '../../../../../server/repositories/webhooks.js';
import { assertProjectRole } from '../../../../../server/auth/rbac.js';

export const runtime = 'nodejs';

export const GET = withRoute(
  {
    auth: true,
  },
  async ({ user, params }) => {
    const workflowId = params.id as string;
    const workflow = await findWorkflowById({ userId: user!.id }, workflowId);
    await assertProjectRole({ userId: user!.id }, workflow.projectId, 'viewer');

    const webhooks = await listWebhooksForWorkflow(workflowId);
    return Response.json({ webhooks });
  }
);
