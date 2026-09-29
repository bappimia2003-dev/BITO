import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { defaultNodeRegistry } from '../../packages/engine/src/index.js';
import { initializeRegistry } from '../../packages/nodes/src/registry.js';
import { PostgresExecutionStore } from '../../apps/web/src/server/engine-runtime/postgresExecutionStore.js';
import { runTick } from '../../apps/web/src/server/engine-runtime/runTick.js';
import { registerTestUser } from '../helpers/phase3Helpers.js';

describe('Phase 6 Concurrency & SKIP LOCKED Integration Tests', { timeout: 60000 }, () => {
  let sql: Sql;
  let store: PostgresExecutionStore;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  let ownerId = '';
  let projectId = '';
  let workflowId = '';
  let versionId = '';
  const nodeNoopId = randomUUID();

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 10 });
    store = new PostgresExecutionStore();
    initializeRegistry(defaultNodeRegistry);

    const owner = await registerTestUser({
      email: `p6_conc_owner_${Date.now()}@example.com`,
      displayName: 'Concurrency Tester',
      password: 'ValidPassword123!',
    });
    ownerId = owner.id;

    const [proj] = await sql`
      INSERT INTO projects (name, owner_id)
      VALUES (${'Concurrency Test Proj ' + Date.now()}, ${ownerId})
      RETURNING id
    `;
    projectId = proj!.id;
    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${projectId}, ${ownerId}, 'owner')
    `;

    const [wf] = await sql`
      INSERT INTO workflows (project_id, name, description)
      VALUES (${projectId}, 'Concurrency Benchmark Workflow', 'Testing SKIP LOCKED with 20 parallel jobs')
      RETURNING id
    `;
    workflowId = wf!.id;

    const snapshot = {
      nodes: [
        {
          id: nodeNoopId,
          key: 'noop',
          type: 'logic.noop',
          typeVersion: 1,
          name: 'Noop Step',
          config: {},
          settings: {},
        },
      ],
      connections: [],
    };

    const [ver] = await sql`
      INSERT INTO workflow_versions (workflow_id, version, snapshot, purpose)
      VALUES (${workflowId}, 1, ${JSON.stringify(snapshot)}::jsonb, 'activation')
      RETURNING id
    `;
    versionId = ver!.id;

    await sql`
      UPDATE workflows
      SET active_version_id = ${versionId}
      WHERE id = ${workflowId}
    `;
  });

  afterAll(async () => {
    if (sql) {
      if (ownerId) await sql`UPDATE users SET is_disabled = true WHERE id = ${ownerId}`;
      await sql.end();
    }
  });

  it('Processes 20 queued jobs across 4 concurrent workers with 0 duplicate executions and 0 deadlocks', async () => {
    const exec = await store.createExecution({
      workflowId,
      versionId,
      projectId,
      mode: 'manual',
    });

    const jobCount = 20;
    const jobsToEnqueue = Array.from({ length: jobCount }, (_, i) => ({
      executionId: exec.id,
      nodeId: nodeNoopId,
      kind: 'run' as const,
      inputPort: 'main',
      input: [{ json: { itemIndex: i } }],
      deliveryKey: `conc_job_${exec.id}_${i}`,
      attempt: 1,
      runAt: new Date().toISOString(),
    }));

    await store.enqueueJobs(jobsToEnqueue);

    // Verify all 20 jobs are in 'ready' status
    const initialJobs = await sql`
      SELECT id, status FROM jobs WHERE execution_id = ${exec.id}
    `;
    expect(initialJobs.length).toBe(jobCount);
    expect(initialJobs.every((j) => j.status === 'ready')).toBe(true);

    // Launch 4 workers running runTick concurrently
    const numWorkers = 4;
    const workerPromises = Array.from({ length: numWorkers }, async (_, wIdx) => {
      const workerId = `worker_${wIdx}_${Date.now()}`;
      let totalWorkerProcessed = 0;
      while (true) {
        const tickRes = await runTick({
          workerId,
          budgetMs: 10000,
          store,
        });

        totalWorkerProcessed += tickRes.processed;

        if (tickRes.processed === 0 && tickRes.remainingReady === 0) {
          break;
        }

        const [pending] = await sql`
          SELECT count(*)::int as count FROM jobs
          WHERE execution_id = ${exec.id} AND status IN ('ready', 'running')
        `;
        if ((pending?.count ?? 0) === 0) {
          break;
        }
      }

      return { workerId, processed: totalWorkerProcessed };
    });

    const workerResults = await Promise.all(workerPromises);

    // Total processed by workers should account for all jobs
    const totalProcessed = workerResults.reduce((acc, w) => acc + w.processed, 0);
    expect(totalProcessed).toBeGreaterThanOrEqual(jobCount);

    // Verify all 20 jobs are marked done
    const finalJobs = await sql`
      SELECT id, status, node_run_id FROM jobs WHERE execution_id = ${exec.id}
    `;
    expect(finalJobs.length).toBe(jobCount);
    expect(finalJobs.every((j) => j.status === 'done')).toBe(true);

    // Verify exactly 20 node_runs exist for this execution
    const nodeRuns = await sql`
      SELECT id, status FROM node_runs WHERE execution_id = ${exec.id}
    `;
    expect(nodeRuns.length).toBe(jobCount);
    expect(nodeRuns.every((nr) => nr.status === 'SUCCESS')).toBe(true);

    // Verify all nodeRunIds linked from jobs are distinct (0 duplicate job processing)
    const linkedNodeRunIds = new Set(finalJobs.map((j) => j.node_run_id));
    expect(linkedNodeRunIds.size).toBe(jobCount);

    // Verify execution finalized
    const finalExec = await store.loadExecution(exec.id);
    expect(finalExec.status).toBe('SUCCESS');
  });
});
