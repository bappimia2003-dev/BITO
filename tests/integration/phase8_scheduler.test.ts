import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { defaultNodeRegistry } from '../../packages/engine/src/index.js';
import { initializeRegistry } from '../../packages/nodes/src/registry.js';
import { registerTestUser } from '../helpers/phase3Helpers.js';
import {
  nextOccurrence,
  getNextOccurrences,
  runDueSchedules,
} from '../../apps/web/src/server/scheduler/scheduleService.js';
import {
  activateWorkflow,
  deactivateWorkflow,
} from '../../apps/web/src/server/workflow/workflowActivation.js';
import { listSchedulesForWorkflow } from '../../apps/web/src/server/repositories/schedules.js';

describe('Phase 8 Scheduler, Timezone & Outage Coalescing Tests', { timeout: 60000 }, () => {
  let sql: Sql;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  let ownerId = '';
  let projectId = '';
  let workflowId = '';
  const scheduleNodeId = crypto.randomUUID();
  const setNodeId = crypto.randomUUID();

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 5 });
    initializeRegistry(defaultNodeRegistry);

    const owner = await registerTestUser({
      email: `p8_sched_${Date.now()}@example.com`,
      displayName: 'Scheduler Tester',
      password: 'ValidPassword123!',
    });
    ownerId = owner.id;

    const [proj] = await sql`
      INSERT INTO projects (name, owner_id)
      VALUES (${'Scheduler Proj ' + Date.now()}, ${ownerId})
      RETURNING id
    `;
    projectId = proj!.id;
    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${projectId}, ${ownerId}, 'owner')
    `;

    const [wf] = await sql`
      INSERT INTO workflows (project_id, name, description, status, revision, created_by)
      VALUES (${projectId}, 'Schedule Workflow', 'Testing scheduler pipeline', 'draft', 1, ${ownerId})
      RETURNING id
    `;
    workflowId = wf!.id;

    await sql`
      INSERT INTO nodes (id, workflow_id, key, type, type_version, name, position_x, position_y, config, settings)
      VALUES
        (${scheduleNodeId}, ${workflowId}, 'schedule', 'trigger.schedule', 1, 'Schedule Trigger', 100, 100,
         ${sql.json({ cron: '*/5 * * * *', timezone: 'Asia/Dhaka' })}, '{}'::jsonb),
        (${setNodeId}, ${workflowId}, 'set_res', 'data.set', 1, 'Set Result', 300, 100,
         ${sql.json({ values: { fired: '{{input.firedAt}}' } })}, '{}'::jsonb)
    `;

    await sql`
      INSERT INTO connections (workflow_id, source_node_id, source_port, target_node_id, target_port)
      VALUES (${workflowId}, ${scheduleNodeId}, 'main', ${setNodeId}, 'main')
    `;
  });

  afterAll(async () => {
    if (sql) {
      if (projectId) {
        await sql`DELETE FROM projects WHERE id = ${projectId}`;
      }
      await sql.end();
    }
  });

  it('1. Timezone & DST correctness across Asia/Dhaka and America/New_York', () => {
    // Asia/Dhaka is UTC+6 (no DST)
    // 09:00 AM Dhaka is 03:00 AM UTC
    const dhakaBase = new Date('2026-06-01T00:00:00.000Z');
    const nextDhaka = nextOccurrence('0 9 * * *', 'Asia/Dhaka', dhakaBase);
    expect(nextDhaka.toISOString()).toBe('2026-06-01T03:00:00.000Z');

    // America/New_York across DST boundaries:
    // Winter: Standard Time (EST = UTC-5) -> 09:00 AM NY is 14:00 UTC
    const nyWinterBase = new Date('2026-01-15T00:00:00.000Z');
    const nextNyWinter = nextOccurrence('0 9 * * *', 'America/New_York', nyWinterBase);
    expect(nextNyWinter.toISOString()).toBe('2026-01-15T14:00:00.000Z');

    // Summer: Daylight Time (EDT = UTC-4) -> 09:00 AM NY is 13:00 UTC
    const nySummerBase = new Date('2026-07-15T00:00:00.000Z');
    const nextNySummer = nextOccurrence('0 9 * * *', 'America/New_York', nySummerBase);
    expect(nextNySummer.toISOString()).toBe('2026-07-15T13:00:00.000Z');
  });

  it('2. Invalid timezone or cron format is rejected with validation error', () => {
    expect(() => nextOccurrence('0 9 * * *', 'Invalid/Timezone')).toThrow();
    expect(() => nextOccurrence('* * * * * *', 'UTC')).toThrow(); // 6 fields
    expect(() => nextOccurrence('not-a-cron', 'UTC')).toThrow();
  });

  it('3. getNextOccurrences returns sequential upcoming timestamps', () => {
    const base = new Date('2026-09-30T10:00:00.000Z');
    const occurrences = getNextOccurrences('*/5 * * * *', 'UTC', 5, base);
    expect(occurrences.length).toBe(5);
    expect(occurrences[0]).toBe('2026-09-30T10:05:00.000Z');
    expect(occurrences[1]).toBe('2026-09-30T10:10:00.000Z');
    expect(occurrences[2]).toBe('2026-09-30T10:15:00.000Z');
  });

  it('4. Activates schedule workflow and creates schedules record in database', async () => {
    const activation = await activateWorkflow({ userId: ownerId }, workflowId);
    expect(activation.ok).toBe(true);

    const scheds = await listSchedulesForWorkflow(workflowId);
    expect(scheds.length).toBe(1);
    const s = scheds[0]!;
    expect(s.cron).toBe('*/5 * * * *');
    expect(s.timezone).toBe('Asia/Dhaka');
    expect(s.enabled).toBe(true);
    expect(new Date(s.nextRunAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('5. Dispatches due schedule and starts execution in mode "schedule"', async () => {
    // Manually force next_run_at to past so it is due
    const pastTime = new Date(Date.now() - 60_000);
    await sql`
      UPDATE schedules
      SET next_run_at = ${pastTime.toISOString()}
      WHERE workflow_id = ${workflowId}
    `;

    const dispatched = await runDueSchedules({ now: new Date() });
    expect(dispatched.length).toBeGreaterThanOrEqual(1);

    const ourDispatch = dispatched.find((d) => d.scheduleId !== undefined);
    expect(ourDispatch).toBeDefined();

    // Verify execution in database
    const [exec] = await sql`
      SELECT id, mode, trigger_node_id, status FROM executions WHERE id = ${ourDispatch!.executionId}
    `;
    expect(exec).toBeDefined();
    expect(exec!.mode).toBe('schedule');
    expect(exec!.trigger_node_id).toBe(scheduleNodeId);
  });

  it('6. Outage coalescing: 1-hour outage coalesces into single execution and advances next_run_at', async () => {
    // Simulate 1 hour of missed runs (e.g. server down for 60 min)
    const oneHourAgo = new Date(Date.now() - 3600_000);
    await sql`
      UPDATE schedules
      SET next_run_at = ${oneHourAgo.toISOString()}
      WHERE workflow_id = ${workflowId}
    `;

    const now = new Date();
    const dispatched = await runDueSchedules({ now });
    expect(dispatched.length).toBe(1);

    // Verify next_run_at was computed starting from max(now, scheduledFor) -> so next_run_at > now!
    const [updated] = await sql`
      SELECT next_run_at FROM schedules WHERE workflow_id = ${workflowId}
    `;
    expect(new Date(updated!.next_run_at).getTime()).toBeGreaterThan(now.getTime());

    // Calling runDueSchedules again immediately dispatches 0 runs
    const secondCall = await runDueSchedules({ now });
    const ourSecond = secondCall.filter((d) => d.scheduleId === dispatched[0]!.scheduleId);
    expect(ourSecond.length).toBe(0);
  });

  it('7. Concurrency test: simultaneous runDueSchedules with FOR UPDATE SKIP LOCKED does not duplicate execution', async () => {
    const pastTime = new Date(Date.now() - 30_000);
    await sql`
      UPDATE schedules
      SET next_run_at = ${pastTime.toISOString()}
      WHERE workflow_id = ${workflowId}
    `;

    const now = new Date();
    // Run two ticks concurrently
    const [res1, res2] = await Promise.all([runDueSchedules({ now }), runDueSchedules({ now })]);

    const allDispatched = [...res1, ...res2];
    const matching = allDispatched.filter((d) => d.executionId !== undefined);
    // Only 1 of the 2 concurrent workers should have claimed and dispatched the schedule!
    expect(matching.length).toBe(1);
  });

  it('8. Deactivating workflow disables schedule and prevents further execution', async () => {
    await deactivateWorkflow({ userId: ownerId }, workflowId);

    const [sched] = await sql`SELECT enabled FROM schedules WHERE workflow_id = ${workflowId}`;
    expect(sched!.enabled).toBe(false);

    // Even if next_run_at is in the past, disabled schedule is not picked up
    await sql`
      UPDATE schedules
      SET next_run_at = ${new Date(Date.now() - 60_000).toISOString()}
      WHERE workflow_id = ${workflowId}
    `;

    const dispatched = await runDueSchedules({ now: new Date() });
    expect(dispatched.filter((d) => d.scheduleId !== undefined).length).toBe(0);
  });
});
