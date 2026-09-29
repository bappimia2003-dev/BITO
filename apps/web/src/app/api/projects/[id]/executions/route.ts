import { z } from 'zod';
import { withRoute } from '../../../../../server/http/withRoute.js';
import { listExecutions } from '../../../../../server/repositories/executions.js';

export const runtime = 'nodejs';

const listQuerySchema = z.object({
  workflowId: z.string().uuid().optional(),
  status: z.enum(['QUEUED', 'RUNNING', 'WAITING', 'SUCCESS', 'FAILED', 'CANCELLED']).optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const GET = withRoute(
  {
    auth: true,
    query: listQuerySchema,
  },
  async ({ user, params, query }) => {
    const projectId = params.id as string;
    const executions = await listExecutions(
      { userId: user!.id },
      projectId,
      query.workflowId,
      query.cursor,
      query.limit ?? 50,
      query.status
    );
    return { executions };
  }
);
