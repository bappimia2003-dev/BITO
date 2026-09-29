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

export async function upsertSchedule(params: {
  workflowId: string;
  nodeId: string;
  cron: string;
  timezone: string;
  nextRunAt: Date;
  enabled?: boolean;
}): Promise<Schedule> {
  const sql = getDb();
  const enabled = params.enabled ?? true;

  const rows = await sql`
    INSERT INTO schedules (
      workflow_id, node_id, cron, timezone, next_run_at, enabled
    ) VALUES (
      ${params.workflowId}, ${params.nodeId}, ${params.cron}, ${params.timezone},
      ${params.nextRunAt.toISOString()}, ${enabled}
    )
    ON CONFLICT (workflow_id, node_id) DO UPDATE SET
      cron = EXCLUDED.cron,
      timezone = EXCLUDED.timezone,
      next_run_at = EXCLUDED.next_run_at,
      enabled = EXCLUDED.enabled
    RETURNING id, workflow_id, node_id, cron, timezone, next_run_at, last_run_at, enabled
  `;

  return parseRow(scheduleSchema, rows[0]!);
}

export async function disableSchedulesForWorkflow(workflowId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE schedules
    SET enabled = false
    WHERE workflow_id = ${workflowId}
  `;
}

export async function listSchedulesForWorkflow(workflowId: string): Promise<Schedule[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, workflow_id, node_id, cron, timezone, next_run_at, last_run_at, enabled
    FROM schedules
    WHERE workflow_id = ${workflowId}
    ORDER BY next_run_at ASC
  `;
  return rows.map((r) => parseRow(scheduleSchema, r));
}
