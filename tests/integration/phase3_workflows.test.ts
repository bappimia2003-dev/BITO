import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import {
  GET as listWorkflowsHandler,
  POST as createWorkflowHandler,
} from '../../apps/web/src/app/api/projects/[id]/workflows/route.js';
import {
  GET as getWorkflowHandler,
  PATCH as updateWorkflowHandler,
  DELETE as deleteWorkflowHandler,
} from '../../apps/web/src/app/api/workflows/[id]/route.js';
import { POST as duplicateWorkflowHandler } from '../../apps/web/src/app/api/workflows/[id]/duplicate/route.js';
import {
  makeReq,
  checkStatus,
  registerTestUser,
  setupProjectAndWorkflow,
} from '../helpers/phase3Helpers.js';

describe('Phase 3 Workflows & Graph Cloning Integration Tests', { timeout: 30000 }, () => {
  let sql: Sql;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  let userACookie = '',
    userBCookie = '',
    userCCookie = '';
  let userAId = '',
    userBId = '',
    userCId = '';
  let projectAId = '',
    workflowAId = '';

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 5 });
    await sql`DELETE FROM rate_limits`;

    const uA = await registerTestUser({
      email: `p3_wf_a_${Date.now()}@example.com`,
      displayName: 'Owner A',
      password: 'ValidPassword123!',
    });
    userACookie = uA.cookie;
    userAId = uA.id;

    const uB = await registerTestUser({
      email: `p3_wf_b_${Date.now()}@example.com`,
      displayName: 'Editor B',
      password: 'ValidPassword123!',
    });
    userBCookie = uB.cookie;
    userBId = uB.id;

    const uC = await registerTestUser({
      email: `p3_wf_c_${Date.now()}@example.com`,
      displayName: 'Stranger C',
      password: 'ValidPassword123!',
    });
    userCCookie = uC.cookie;
    userCId = uC.id;

    const setup = await setupProjectAndWorkflow(userACookie, sql);
    projectAId = setup.projectId;
    workflowAId = setup.workflowId;

    // Add userB as editor to projectA
    await sql`INSERT INTO project_members (project_id, user_id, role) VALUES (${projectAId}, ${userBId}, 'editor')`;
  });

  afterAll(async () => {
    if (sql) {
      if (userAId) await sql`UPDATE users SET is_disabled = true WHERE id = ${userAId}`;
      if (userBId) await sql`UPDATE users SET is_disabled = true WHERE id = ${userBId}`;
      if (userCId) await sql`UPDATE users SET is_disabled = true WHERE id = ${userCId}`;
      await sql.end();
    }
  });

  it('1. Workflow IDOR: Stranger C cannot access or mutate Workflow A', async () => {
    const pCtx = { params: Promise.resolve({ id: projectAId }) };
    const wCtx = { params: Promise.resolve({ id: workflowAId }) };

    await checkStatus(
      listWorkflowsHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/workflows`, userCCookie),
        pCtx
      ),
      403
    );
    await checkStatus(
      createWorkflowHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/workflows`, userCCookie, 'POST', {
          name: 'Bad Flow',
        }),
        pCtx
      ),
      403
    );
    await checkStatus(
      getWorkflowHandler(
        makeReq(`http://localhost:3000/api/workflows/${workflowAId}`, userCCookie),
        wCtx
      ),
      403
    );
    await checkStatus(
      updateWorkflowHandler(
        makeReq(`http://localhost:3000/api/workflows/${workflowAId}`, userCCookie, 'PATCH', {
          name: 'Hacked',
        }),
        wCtx
      ),
      403
    );
    await checkStatus(
      duplicateWorkflowHandler(
        makeReq(
          `http://localhost:3000/api/workflows/${workflowAId}/duplicate`,
          userCCookie,
          'POST'
        ),
        wCtx
      ),
      403
    );
    await checkStatus(
      deleteWorkflowHandler(
        makeReq(`http://localhost:3000/api/workflows/${workflowAId}`, userCCookie, 'DELETE'),
        wCtx
      ),
      403
    );
  });

  it('2. Editor B can mutate workflow, duplicate graph with cloned nodes/connections, and delete', async () => {
    const wCtx = { params: Promise.resolve({ id: workflowAId }) };

    await checkStatus(
      updateWorkflowHandler(
        makeReq(`http://localhost:3000/api/workflows/${workflowAId}`, userBCookie, 'PATCH', {
          name: 'Renamed by Editor',
        }),
        wCtx
      ),
      200
    );

    const dupRes = await checkStatus(
      duplicateWorkflowHandler(
        makeReq(
          `http://localhost:3000/api/workflows/${workflowAId}/duplicate`,
          userBCookie,
          'POST'
        ),
        wCtx
      ),
      200
    );
    const dupData = await dupRes.json();
    expect(dupData.workflow.name).toBe('Renamed by Editor (Copy)');

    const dupNodes = await sql`SELECT id FROM nodes WHERE workflow_id = ${dupData.workflow.id}`;
    expect(dupNodes.length).toBe(2);
    const dupConns =
      await sql`SELECT id FROM connections WHERE workflow_id = ${dupData.workflow.id}`;
    expect(dupConns.length).toBe(1);

    await checkStatus(
      deleteWorkflowHandler(
        makeReq(
          `http://localhost:3000/api/workflows/${dupData.workflow.id}`,
          userBCookie,
          'DELETE'
        ),
        { params: Promise.resolve({ id: dupData.workflow.id }) }
      ),
      200
    );
  });
});
