import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { defaultNodeRegistry } from '../../packages/engine/src/index.js';
import { initializeRegistry } from '../../packages/nodes/src/registry.js';
import { runTick } from '../../apps/web/src/server/engine-runtime/runTick.js';
import { makeReq, registerTestUser } from '../helpers/phase3Helpers.js';
import { PATCH as patchWorkflowHandler } from '../../apps/web/src/app/api/workflows/[id]/route.js';
import { POST as validateWorkflowHandler } from '../../apps/web/src/app/api/workflows/[id]/validate/route.js';
import { POST as runWorkflowHandler } from '../../apps/web/src/app/api/workflows/[id]/run/route.js';
import { GET as getExecutionHandler } from '../../apps/web/src/app/api/executions/[id]/route.js';

describe('Phase 7 End-to-End Smoke Test (Manual + Set + IF)', { timeout: 60000 }, () => {
  let sql: Sql;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  let ownerCookie = '';
  let ownerId = '';
  let projectId = '';
  let workflowId = '';

  const triggerId = randomUUID();
  const setNodeId = randomUUID();
  const ifNodeId = randomUUID();
  const passNodeId = randomUUID();

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 5 });
    initializeRegistry(defaultNodeRegistry);

    const owner = await registerTestUser({
      email: `p7_smoke_${Date.now()}@example.com`,
      displayName: 'Smoke Tester',
      password: 'ValidPassword123!',
    });
    ownerCookie = owner.cookie;
    ownerId = owner.id;

    const [proj] = await sql`
      INSERT INTO projects (name, owner_id)
      VALUES (${'Smoke Test Proj ' + Date.now()}, ${ownerId})
      RETURNING id
    `;
    projectId = proj!.id;
    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${projectId}, ${ownerId}, 'owner')
    `;

    const [wf] = await sql`
      INSERT INTO workflows (project_id, name, description, status, revision, created_by)
      VALUES (${projectId}, 'Smoke Workflow', 'End-to-end smoke test', 'draft', 1, ${ownerId})
      RETURNING id
    `;
    workflowId = wf!.id;
  });

  afterAll(async () => {
    if (sql) {
      if (projectId) {
        await sql`DELETE FROM projects WHERE id = ${projectId}`;
      }
      await sql.end({ timeout: 5 });
    }
  });

  it('1. Build and save graph with Manual + Set + IF + Set nodes', async () => {
    const payload = {
      expectedRevision: 1,
      name: 'Smoke Workflow Active',
      nodes: [
        {
          id: triggerId,
          key: 'manual_trigger',
          type: 'trigger.manual',
          typeVersion: 1,
          name: 'Start Manual',
          positionX: 50,
          positionY: 100,
          config: {},
          settings: {},
        },
        {
          id: setNodeId,
          key: 'set_score',
          type: 'data.set',
          typeVersion: 1,
          name: 'Set Score',
          positionX: 250,
          positionY: 100,
          config: {
            assignments: [{ name: 'score', value: 95, type: 'number' }],
          },
          settings: {},
        },
        {
          id: ifNodeId,
          key: 'check_score',
          type: 'logic.if',
          typeVersion: 1,
          name: 'Check Score',
          positionX: 450,
          positionY: 100,
          config: {
            conditions: [{ left: '{{ input.score }}', operator: 'gte', right: 90 }],
          },
          settings: {},
        },
        {
          id: passNodeId,
          key: 'pass_output',
          type: 'data.set',
          typeVersion: 1,
          name: 'Pass Output',
          positionX: 650,
          positionY: 50,
          config: {
            assignments: [{ name: 'result', value: 'PASSED', type: 'string' }],
          },
          settings: {},
        },
      ],
      connections: [
        {
          sourceNodeId: triggerId,
          sourcePort: 'main',
          targetNodeId: setNodeId,
          targetPort: 'main',
        },
        {
          sourceNodeId: setNodeId,
          sourcePort: 'main',
          targetNodeId: ifNodeId,
          targetPort: 'main',
        },
        {
          sourceNodeId: ifNodeId,
          sourcePort: 'true',
          targetNodeId: passNodeId,
          targetPort: 'main',
        },
      ],
    };

    const req = makeReq(
      `http://localhost/api/workflows/${workflowId}`,
      ownerCookie,
      'PATCH',
      payload
    );
    const res = await patchWorkflowHandler(req, { params: Promise.resolve({ id: workflowId }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.nodes.length).toBe(4);
    expect(data.connections.length).toBe(3);
  });

  it('2. Validate saved workflow graph passes with zero errors', async () => {
    const req = makeReq(
      `http://localhost/api/workflows/${workflowId}/validate`,
      ownerCookie,
      'POST',
      {}
    );
    const res = await validateWorkflowHandler(req, { params: Promise.resolve({ id: workflowId }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.isValid).toBe(true);
    expect(data.errorCount).toBe(0);
  });

  it('3. Trigger workflow run and verify all nodes succeed and produce expected JSON', async () => {
    const runReq = makeReq(
      `http://localhost/api/workflows/${workflowId}/run`,
      ownerCookie,
      'POST',
      {
        triggerNodeId: triggerId,
        payload: { test: true },
      }
    );
    const runRes = await runWorkflowHandler(runReq, {
      params: Promise.resolve({ id: workflowId }),
    });
    expect(runRes.status).toBe(200);

    const runData = await runRes.json();
    const executionId = runData.executionId;
    expect(executionId).toBeDefined();

    // Advance engine tick budget if not already finished
    for (let i = 0; i < 5; i++) {
      const execRows = await sql`SELECT status FROM executions WHERE id = ${executionId}`;
      if (execRows[0]?.status === 'SUCCESS' || execRows[0]?.status === 'FAILED') break;
      await runTick({ budgetMs: 5000 });
    }

    // Inspect execution via GET /api/executions/:id
    const getReq = makeReq(`http://localhost/api/executions/${executionId}`, ownerCookie, 'GET');
    const getRes = await getExecutionHandler(getReq, {
      params: Promise.resolve({ id: executionId }),
    });
    expect(getRes.status).toBe(200);

    const detail = await getRes.json();
    expect(detail.execution.status).toBe('SUCCESS');
    expect(detail.nodeRuns.length).toBeGreaterThanOrEqual(4);

    // Verify all runs succeeded
    for (const run of detail.nodeRuns) {
      expect(run.status).toBe('SUCCESS');
    }

    // Verify final pass_output node output
    const passRun = detail.nodeRuns.find((r: { nodeKey: string }) => r.nodeKey === 'pass_output');
    expect(passRun).toBeDefined();
    expect(passRun.output).toBeDefined();
    const mainItems = passRun.output.main || Object.values(passRun.output)[0];
    expect(mainItems[0].json.result).toBe('PASSED');
  });

  it('4. Connection validation blocks illegal self-loop connections', async () => {
    const req = makeReq(
      `http://localhost/api/workflows/${workflowId}/validate`,
      ownerCookie,
      'POST',
      {
        nodes: [{ id: triggerId, key: 'self_loop_node', type: 'trigger.manual', name: 'Loop' }],
        connections: [
          {
            sourceNodeId: triggerId,
            sourcePort: 'main',
            targetNodeId: triggerId,
            targetPort: 'main',
          },
        ],
      }
    );
    const res = await validateWorkflowHandler(req, { params: Promise.resolve({ id: workflowId }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.isValid).toBe(false);
    expect(data.errorCount).toBeGreaterThan(0);
    expect(
      data.issues.some(
        (i: { code: string }) => i.code === 'CYCLE_NOT_ALLOWED' || i.code === 'PORT_INVALID'
      )
    ).toBe(true);
  });
});
