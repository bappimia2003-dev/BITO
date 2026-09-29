import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { defaultNodeRegistry } from '../../packages/engine/src/index.js';
import { initializeRegistry } from '../../packages/nodes/src/registry.js';
import { PostgresExecutionStore } from '../../apps/web/src/server/engine-runtime/postgresExecutionStore.js';
import { startExecution } from '../../apps/web/src/server/engine-runtime/startExecution.js';
import { runTick } from '../../apps/web/src/server/engine-runtime/runTick.js';
import { POST as cancelExecutionHandler } from '../../apps/web/src/app/api/executions/[id]/cancel/route.js';
import { POST as retryExecutionHandler } from '../../apps/web/src/app/api/executions/[id]/retry/route.js';
import { makeReq, registerTestUser } from '../helpers/phase3Helpers.js';

describe('Phase 6 Engine Core Integration Tests', { timeout: 45000 }, () => {
  let sql: Sql;
  let store: PostgresExecutionStore;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  let ownerCookie = '';
  let ownerId = '';
  let strangerCookie = '';
  let strangerId = '';
  let projectId = '';
  let workflowId = '';
  let versionId = '';
  const nodeTriggerId = randomUUID();
  const nodeHttpId = randomUUID();

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 5 });
    store = new PostgresExecutionStore();
    initializeRegistry(defaultNodeRegistry);

    const owner = await registerTestUser({
      email: `p6_owner_${Date.now()}@example.com`,
      displayName: 'Engine Owner',
      password: 'ValidPassword123!',
    });
    ownerCookie = owner.cookie;
    ownerId = owner.id;

    const stranger = await registerTestUser({
      email: `p6_stranger_${Date.now()}@example.com`,
      displayName: 'Engine Stranger',
      password: 'ValidPassword123!',
    });
    strangerCookie = stranger.cookie;
    strangerId = stranger.id;

    const [proj] = await sql`
      INSERT INTO projects (name, owner_id)
      VALUES (${'Engine Test Proj ' + Date.now()}, ${ownerId})
      RETURNING id
    `;
    projectId = proj!.id;
    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${projectId}, ${ownerId}, 'owner')
    `;

    const [wf] = await sql`
      INSERT INTO workflows (project_id, name, description)
      VALUES (${projectId}, 'Live Engine HTTP Workflow', 'Workflow testing real execution and SafeHttp')
      RETURNING id
    `;
    workflowId = wf!.id;

    const snapshot = {
      nodes: [
        {
          id: nodeTriggerId,
          key: 'trigger',
          type: 'trigger.manual',
          typeVersion: 1,
          name: 'Manual Trigger',
          config: {},
          settings: {},
        },
        {
          id: nodeHttpId,
          key: 'httpReq',
          type: 'api.http',
          typeVersion: 1,
          name: 'Example HTTP Call',
          config: {
            method: 'GET',
            url: 'https://example.com',
            responseType: 'text',
          },
          settings: {},
        },
      ],
      connections: [
        {
          id: 'conn_1',
          sourceNodeId: nodeTriggerId,
          sourcePort: 'main',
          targetNodeId: nodeHttpId,
          targetPort: 'main',
        },
      ],
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
      if (strangerId) await sql`UPDATE users SET is_disabled = true WHERE id = ${strangerId}`;
      await sql.end();
    }
  });

  it('1. Idempotent job delivery: duplicate enqueue with same deliveryKey does not create duplicate jobs', async () => {
    const exec = await store.createExecution({
      workflowId,
      versionId,
      projectId,
      mode: 'manual',
    });

    const key = `idem_test_${Date.now()}`;
    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: nodeTriggerId,
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { foo: 'bar' } }],
        deliveryKey: key,
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    // Enqueue identical job a second time
    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: nodeTriggerId,
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { foo: 'bar' } }],
        deliveryKey: key,
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    const jobs = await sql`
      SELECT id FROM jobs WHERE execution_id = ${exec.id} AND delivery_key = ${key}
    `;
    expect(jobs.length).toBe(1);
  });

  it('2. Stale-lease reclamation: reclaims timed-out worker leases and kills after 5 retries', async () => {
    const exec = await store.createExecution({
      workflowId,
      versionId,
      projectId,
      mode: 'manual',
    });

    const [job] = await sql`
      INSERT INTO jobs (
        execution_id, node_id, kind, input_port, input, delivery_key,
        attempt, status, run_at, locked_by, locked_until, reclaim_count
      ) VALUES (
        ${exec.id}, ${nodeTriggerId}, 'run', 'main', '[]'::jsonb,
        ${'stale_test_' + Date.now()}, 1, 'running', NOW(),
        'dead-worker-uuid', NOW() - INTERVAL '10 seconds', 0
      )
      RETURNING id
    `;
    const jobId = job!.id;

    // First reclaim should mark it ready
    const reclaimedCount = await store.reclaimStaleJobs();
    expect(reclaimedCount).toBeGreaterThanOrEqual(1);

    const [afterReclaim] =
      await sql`SELECT status, reclaim_count, locked_by FROM jobs WHERE id = ${jobId}`;
    expect(afterReclaim!.status).toBe('ready');
    expect(afterReclaim!.reclaim_count).toBe(1);
    expect(afterReclaim!.locked_by).toBeNull();

    // Now set reclaim_count = 5 and status = 'running' past locked_until
    await sql`
      UPDATE jobs
      SET status = 'running', locked_by = 'dead-worker-2',
          locked_until = NOW() - INTERVAL '10 seconds', reclaim_count = 5
      WHERE id = ${jobId}
    `;
    await store.reclaimStaleJobs();

    const [deadJob] = await sql`SELECT status FROM jobs WHERE id = ${jobId}`;
    expect(deadJob!.status).toBe('dead');
  });

  it('3. Sequential workflow execution with live HTTP request to https://example.com via SafeHttp', async () => {
    const execId = await startExecution({
      workflowId,
      projectId,
      triggerNodeId: nodeTriggerId,
      versionId,
      items: [{ json: { test: true } }],
    });

    expect(execId).toBeDefined();

    // Run tick(s) until workflow completes
    const tick1 = await runTick({ budgetMs: 15000 });
    let totalProcessed = tick1.processed;
    if (totalProcessed < 2) {
      const tick2 = await runTick({ budgetMs: 15000 });
      totalProcessed += tick2.processed;
    }
    expect(totalProcessed).toBeGreaterThanOrEqual(2);

    // Verify execution status is SUCCESS
    const finalExec = await store.loadExecution(execId);
    expect(finalExec.status).toBe('SUCCESS');

    // Verify node_runs records
    const nodeRuns = await store.loadPriorNodeRuns(execId);
    expect(nodeRuns.length).toBe(2);

    const httpRun = nodeRuns.find((r) => r.nodeId === nodeHttpId);
    expect(httpRun).toBeDefined();
    expect(httpRun!.status).toBe('SUCCESS');

    // Verify HTTP response output was captured
    const httpOutput = httpRun!.output?.['main']?.[0]?.json as { status: number; ok: boolean };
    expect(httpOutput).toBeDefined();
    expect(httpOutput.status).toBe(200);
    expect(httpOutput.ok).toBe(true);

    // Verify logs were written
    const logs = await sql`SELECT * FROM logs WHERE execution_id = ${execId}`;
    expect(logs.length).toBeGreaterThan(0);
  });

  it('4. Cancel execution endpoint: rejects unauthorized users, cancels active execution and deads jobs', async () => {
    const exec = await store.createExecution({
      workflowId,
      versionId,
      projectId,
      mode: 'manual',
    });

    await store.enqueueJobs([
      {
        executionId: exec.id,
        nodeId: nodeTriggerId,
        kind: 'run',
        inputPort: 'main',
        input: [{ json: { test: 'cancel' } }],
        deliveryKey: `cancel_job_${Date.now()}`,
        attempt: 1,
        runAt: new Date().toISOString(),
      },
    ]);

    // Stranger C attempts to cancel -> 403 Forbidden
    const strangerReq = makeReq(
      `http://localhost:3000/api/executions/${exec.id}/cancel`,
      strangerCookie,
      'POST'
    );
    const strangerRes = await cancelExecutionHandler(strangerReq, {
      params: Promise.resolve({ id: exec.id }),
    });
    expect(strangerRes.status).toBe(403);

    // Owner cancels -> 200 OK
    const ownerReq = makeReq(
      `http://localhost:3000/api/executions/${exec.id}/cancel`,
      ownerCookie,
      'POST'
    );
    const ownerRes = await cancelExecutionHandler(ownerReq, {
      params: Promise.resolve({ id: exec.id }),
    });
    expect(ownerRes.status).toBe(200);

    const canceledExec = await store.loadExecution(exec.id);
    expect(canceledExec.status).toBe('CANCELLED');

    const jobs = await sql`SELECT status FROM jobs WHERE execution_id = ${exec.id}`;
    expect(jobs.every((j) => j.status === 'dead')).toBe(true);
  });

  it('5. Retry execution endpoint: creates new execution, copies successful runs, and re-queues failed node', async () => {
    // 1. Create a failed execution
    const exec = await store.createExecution({
      workflowId,
      versionId,
      projectId,
      mode: 'manual',
    });

    // Node 1 was successful
    await sql`
      INSERT INTO node_runs (
        execution_id, node_id, node_key, status, attempt, input_port, input, output, queued_at, finished_at
      ) VALUES (
        ${exec.id}, ${nodeTriggerId}, ${nodeTriggerId}, 'SUCCESS', 1, 'main', '[]'::jsonb,
        ${JSON.stringify({ main: [{ json: { from: 'trigger' } }] })}::jsonb,
        NOW(), NOW()
      )
    `;

    // Node 2 failed
    await sql`
      INSERT INTO node_runs (
        execution_id, node_id, node_key, status, attempt, input_port, input, error, queued_at, finished_at
      ) VALUES (
        ${exec.id}, ${nodeHttpId}, ${nodeHttpId}, 'FAILED', 1, 'main',
        ${JSON.stringify([{ json: { from: 'trigger' } }])}::jsonb,
        ${JSON.stringify({ code: 'HTTP_ERROR', message: 'Failed to connect' })}::jsonb,
        NOW(), NOW()
      )
    `;

    await store.setExecutionStatus(exec.id, 'FAILED', { code: 'HTTP_ERROR' });

    // Call retry endpoint
    const retryReq = makeReq(
      `http://localhost:3000/api/executions/${exec.id}/retry`,
      ownerCookie,
      'POST'
    );
    const retryRes = await retryExecutionHandler(retryReq, {
      params: Promise.resolve({ id: exec.id }),
    });
    expect(retryRes.status).toBe(200);

    const data = await retryRes.json();
    expect(data.ok).toBe(true);
    expect(data.newExecutionId).toBeDefined();

    const newExecId = data.newExecutionId;
    const newExec = await store.loadExecution(newExecId);
    expect(newExec.retryOfExecutionId).toBe(exec.id);

    // Verify successful node 1 was copied
    const copiedRuns = await store.loadPriorNodeRuns(newExecId);
    expect(copiedRuns.some((r) => r.nodeId === nodeTriggerId && r.status === 'SUCCESS')).toBe(true);

    // Verify failed node 2 was re-enqueued as ready
    const newJobs =
      await sql`SELECT * FROM jobs WHERE execution_id = ${newExecId} AND node_id = ${nodeHttpId}`;
    expect(newJobs.length).toBe(1);
    expect(newJobs[0]!.status).toBe('ready');
  });
});
