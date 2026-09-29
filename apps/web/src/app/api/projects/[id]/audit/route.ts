import { z } from 'zod';
import { withRoute } from '../../../../../server/http/withRoute.js';
import { listAuditLogs } from '../../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

const auditQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
});

export const GET = withRoute(
  {
    auth: true,
    role: 'owner',
    query: auditQuerySchema,
  },
  async ({ params, query }) => {
    const projectId = params.id as string;
    const logs = await listAuditLogs(projectId, query.cursor, query.limit);
    const nextCursor = logs.length === query.limit ? logs[logs.length - 1]?.id : undefined;

    return {
      logs,
      nextCursor,
    };
  }
);
