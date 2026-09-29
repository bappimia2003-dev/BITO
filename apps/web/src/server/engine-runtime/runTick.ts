import { randomUUID } from 'node:crypto';
import { logger } from '@bito/shared';
import {
  defaultNodeRegistry,
  type ExecutionStore,
  type Job,
  type NodeRegistry,
  processJob,
} from '@bito/engine';
import { getDb } from '../db/client.js';
import { safeHttp } from '../security/safeHttp.js';
import { PostgresExecutionStore } from './postgresExecutionStore.js';
import { PostgresCredentialResolver } from './credentialResolver.js';

let lastHousekeepingTime = 0;
const HOUSEKEEPING_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

export interface RunTickOptions {
  budgetMs?: number;
  workerId?: string;
  store?: ExecutionStore;
  registry?: NodeRegistry;
}

export interface TickResult {
  processed: number;
  remainingReady: number;
  reclaimed: number;
}

export async function runTick(options: RunTickOptions = {}): Promise<TickResult> {
  const budgetMs = options.budgetMs ?? 20_000;
  const workerId = options.workerId ?? randomUUID();
  const store = options.store ?? new PostgresExecutionStore();
  const registry = options.registry ?? defaultNodeRegistry;
  const credentialResolver = new PostgresCredentialResolver();

  const deadline = Date.now() + budgetMs;
  let processed = 0;

  // 1. Housekeeping (at most every 10 min)
  if (Date.now() - lastHousekeepingTime > HOUSEKEEPING_INTERVAL_MS) {
    try {
      await runHousekeeping();
      lastHousekeepingTime = Date.now();
    } catch (err) {
      logger.warn('Housekeeping failed', { error: String(err) });
    }
  }

  // 2. Reclaim stale jobs
  let reclaimed = 0;
  try {
    reclaimed = await store.reclaimStaleJobs();
  } catch (err) {
    logger.warn('Reclaim stale jobs failed', { error: String(err) });
  }

  // 3. Claim and process loop
  while (Date.now() < deadline) {
    let jobs: Job[] = [];
    try {
      jobs = await store.claimJobs(workerId, 5, 60_000);
    } catch (err) {
      logger.error('Failed to claim jobs in tick', { error: String(err) });
      break;
    }

    if (jobs.length === 0) {
      break;
    }

    const settled = await Promise.allSettled(
      jobs.map(async (job) => {
        try {
          await processJob(job, {
            store,
            registry,
            http: safeHttp,
            credentialResolver,
          });
          // Mark job as done upon successful processing completion
          await markJobDone(job.id);
        } catch (jobErr) {
          logger.error(`Error processing job ${job.id}`, { error: String(jobErr) });
        }
      })
    );

    processed += settled.length;
  }

  // 4. Count remaining ready jobs
  const sql = getDb();
  let remainingReady = 0;
  try {
    const readyRows = await sql`
      SELECT COUNT(*)::int as count FROM jobs WHERE status = 'ready' AND run_at <= NOW()
    `;
    remainingReady = Number(readyRows[0]?.count ?? 0);
  } catch {
    remainingReady = 0;
  }

  return { processed, remainingReady, reclaimed };
}

async function markJobDone(jobId: string): Promise<void> {
  const sql = getDb();
  await sql`
    UPDATE jobs
    SET status = 'done',
        locked_by = NULL,
        locked_until = NULL
    WHERE id = ${jobId} AND status = 'running'
  `;
}

async function runHousekeeping(): Promise<void> {
  const sql = getDb();
  await sql`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '1 day'`;
  await sql`DELETE FROM webhook_events WHERE received_at < NOW() - INTERVAL '7 days'`;
  await sql`DELETE FROM webauthn_challenges WHERE expires_at < NOW()`;
  await sql`
    DELETE FROM sessions 
    WHERE (expires_at < NOW() OR revoked_at IS NOT NULL) 
      AND created_at < NOW() - INTERVAL '7 days'
  `;
  await sql`
    DELETE FROM executions
    WHERE created_at < NOW() - INTERVAL '30 days'
  `;
}
