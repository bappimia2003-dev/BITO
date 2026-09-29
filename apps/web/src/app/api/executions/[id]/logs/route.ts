import { z } from 'zod';
import { withRoute } from '../../../../../server/http/withRoute.js';
import { getExecutionLogs } from '../../../../../server/repositories/executions.js';

export const runtime = 'nodejs';

const logsQuerySchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  kind: z.enum(['system', 'node', 'http', 'ai_step']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const GET = withRoute(
  {
    auth: true,
    query: logsQuerySchema,
  },
  async ({ user, params, query }) => {
    const executionId = params.id as string;
    const logs = await getExecutionLogs({ userId: user!.id }, executionId, query);
    return { logs };
  }
);
