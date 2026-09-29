import { z } from 'zod';
import { getDb } from '../db/client.js';
import { parseRow } from './base.js';

export const scheduleSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  nodeId: z.string().uuid(),
  cron: z.string(),
  timezone: z.string().default('UTC'),
  nextRunAt: z.string(),
  lastRunAt: z.string().nullable().optional(),
  enabled: z.boolean().default(true),
});

export type Schedule = z.infer<typeof scheduleSchema>;

export async function listDueSchedules(limit: number = 50): Promise<Schedule[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, workflow_id, node_id, cron, timezone, next_run_at, last_run_at, enabled
    FROM schedules
    WHERE enabled = true AND next_run_at <= now()
    ORDER BY next_run_at ASC
    LIMIT ${limit}
  `;
  return rows.map((r) => parseRow(scheduleSchema, r));
}
