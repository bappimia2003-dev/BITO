import { withRoute } from '../../../../server/http/withRoute.js';
import { findExecutionById } from '../../../../server/repositories/executions.js';

export const runtime = 'nodejs';

export const GET = withRoute(
  {
    auth: true,
  },
  async ({ user, params }) => {
    const executionId = params.id as string;
    const detail = await findExecutionById({ userId: user!.id }, executionId);
    return detail;
  }
);
