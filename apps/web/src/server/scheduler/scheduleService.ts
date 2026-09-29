import { CronExpressionParser } from 'cron-parser';
import { BitoError, logger } from '@bito/shared';
import { getDb } from '../db/client.js';
import { startExecution } from '../engine-runtime/startExecution.js';

export function nextOccurrence(cron: string, timezone: string, fromDate?: Date): Date {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new BitoError(
      'VALIDATION_FAILED',
      `Invalid cron expression: must have 5 fields (got ${parts.length})`
    );
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new BitoError('VALIDATION_FAILED', `Invalid IANA timezone: ${timezone}`);
  }

  try {
    const interval = CronExpressionParser.parse(cron.trim(), {
      currentDate: fromDate ?? new Date(),
      tz: timezone,
    });
    return interval.next().toDate();
  } catch (err) {
    throw new BitoError('VALIDATION_FAILED', `Failed to parse cron schedule: ${String(err)}`);
  }
}

export function getNextOccurrences(
  cron: string,
  timezone: string,
  count: number = 5,
  fromDate?: Date
): string[] {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new BitoError(
      'VALIDATION_FAILED',
      `Invalid cron expression: must have 5 fields (got ${parts.length})`
    );
  }

  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    throw new BitoError('VALIDATION_FAILED', `Invalid IANA timezone: ${timezone}`);
  }

  try {
    const interval = CronExpressionParser.parse(cron.trim(), {
      currentDate: fromDate ?? new Date(),
      tz: timezone,
    });
    const results: string[] = [];
    for (let i = 0; i < count; i++) {
      results.push(interval.next().toDate().toISOString());
    }
    return results;
  } catch (err) {
    throw new BitoError('VALIDATION_FAILED', `Failed to parse cron schedule: ${String(err)}`);
  }
}

export interface RunDueSchedulesOptions {
  now?: Date;
  limit?: number;
}

export interface ScheduledRunResult {
  scheduleId: string;
  executionId: string;
}

export async function runDueSchedules(
  options: RunDueSchedulesOptions = {}
): Promise<ScheduledRunResult[]> {
  const sql = getDb();
  const now = options.now ?? new Date();
  const limit = options.limit ?? 50;

  // Run in a transaction to lock due schedules with FOR UPDATE SKIP LOCKED
  return await sql.begin(async (tx) => {
    // 1. Select and lock due schedules for active workflows with an active version
    const dueRows = await tx`
      SELECT s.id, s.workflow_id, s.node_id, s.cron, s.timezone, s.next_run_at, s.last_run_at,
             w.project_id, w.active_version_id
      FROM schedules s
      JOIN workflows w ON w.id = s.workflow_id
      WHERE s.enabled = true
        AND s.next_run_at <= ${now.toISOString()}
        AND w.status = 'active'
        AND w.active_version_id IS NOT NULL
      ORDER BY s.next_run_at ASC
      LIMIT ${limit}
      FOR UPDATE OF s SKIP LOCKED
    `;

    if (dueRows.length === 0) {
      return [];
    }

    const results: ScheduledRunResult[] = [];

    for (const row of dueRows) {
      const scheduledFor = new Date(row.next_run_at as string);
      // Coalescing: calculate next occurrence starting from max(now, scheduledFor)
      const baseDate = new Date(Math.max(now.getTime(), scheduledFor.getTime()));
      let nextRun: Date;
      try {
        nextRun = nextOccurrence(row.cron as string, row.timezone as string, baseDate);
      } catch (err) {
        logger.error('Failed to calculate next schedule occurrence', {
          scheduleId: row.id,
          cron: row.cron,
          error: String(err),
        });
        continue;
      }

      // Update schedule record
      await tx`
        UPDATE schedules
        SET next_run_at = ${nextRun.toISOString()},
            last_run_at = ${now.toISOString()}
        WHERE id = ${row.id}
      `;

      // Start execution for the schedule
      try {
        const executionId = await startExecution({
          workflowId: row.workflow_id as string,
          projectId: row.project_id as string,
          versionId: row.active_version_id as string,
          triggerNodeId: row.node_id as string,
          mode: 'schedule',
          items: [
            {
              json: {
                scheduledFor: scheduledFor.toISOString(),
                firedAt: now.toISOString(),
              },
            },
          ],
        });

        results.push({
          scheduleId: row.id as string,
          executionId,
        });
      } catch (err) {
        logger.error('Failed to start execution for due schedule', {
          scheduleId: row.id,
          workflowId: row.workflow_id,
          error: String(err),
        });
      }
    }

    return results;
  });
}
