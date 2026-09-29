import { z } from 'zod';
import { withRoute } from '../../../../../../server/http/withRoute.js';
import { getNextOccurrences } from '../../../../../../server/scheduler/scheduleService.js';

export const runtime = 'nodejs';

const previewSchema = z.object({
  cron: z.string(),
  timezone: z.string().default('UTC'),
  count: z.number().int().min(1).max(20).default(5),
});

export const POST = withRoute(
  {
    auth: true,
    body: previewSchema,
  },
  async ({ body }) => {
    const occurrences = getNextOccurrences(
      body.cron,
      body.timezone ?? 'UTC',
      body.count ?? 5
    );
    return Response.json({ occurrences });
  }
);
