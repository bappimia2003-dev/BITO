import { withRoute } from '../../../../../server/http/withRoute.js';
import { deactivateWorkflow } from '../../../../../server/workflow/workflowActivation.js';

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    auth: true,
  },
  async ({ user, params, req }) => {
    const workflowId = params.id as string;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const userAgent = req.headers.get('user-agent') ?? undefined;

    const result = await deactivateWorkflow({ userId: user!.id }, workflowId, ip, userAgent);

    return Response.json(result);
  }
);
