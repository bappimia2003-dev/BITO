import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { GET as listProjectsHandler } from '../../apps/web/src/app/api/projects/route.js';
import {
  GET as getProjectHandler,
  PATCH as updateProjectHandler,
  DELETE as deleteProjectHandler,
} from '../../apps/web/src/app/api/projects/[id]/route.js';
import {
  GET as getMembersHandler,
  POST as addMemberHandler,
  PATCH as updateMemberHandler,
  DELETE as removeMemberHandler,
} from '../../apps/web/src/app/api/projects/[id]/members/route.js';
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
import { GET as getAuditLogsHandler } from '../../apps/web/src/app/api/projects/[id]/audit/route.js';
import {
  makeReq,
  checkStatus,
  registerTestUser,
  setupProjectAndWorkflow,
} from '../helpers/phase3Helpers.js';

describe('Phase 3 Projects, Roles & Workflows Integration Tests', { timeout: 30000 }, () => {
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
      email: `p3_a_${Date.now()}@example.com`,
      displayName: 'Owner A',
      password: 'ValidPassword123!',
    });
    userACookie = uA.cookie;
    userAId = uA.id;

    const uB = await registerTestUser({
      email: `p3_b_${Date.now()}@example.com`,
      displayName: 'Member B',
      password: 'ValidPassword123!',
    });
    userBCookie = uB.cookie;
    userBId = uB.id;

    const uC = await registerTestUser({
      email: `p3_c_${Date.now()}@example.com`,
      displayName: 'Attacker C',
      password: 'ValidPassword123!',
    });
    userCCookie = uC.cookie;
    userCId = uC.id;
  });

  afterAll(async () => {
    if (sql) {
      if (userAId) await sql`UPDATE users SET is_disabled = true WHERE id = ${userAId}`;
      if (userBId) await sql`UPDATE users SET is_disabled = true WHERE id = ${userBId}`;
      if (userCId) await sql`UPDATE users SET is_disabled = true WHERE id = ${userCId}`;
      await sql.end();
    }
  });

  it('1. User A creates Project A and Workflow A with nodes and connections', async () => {
    const setup = await setupProjectAndWorkflow(userACookie, sql);
    projectAId = setup.projectId;
    workflowAId = setup.workflowId;

    const listRes = await checkStatus(
      listProjectsHandler(makeReq('http://localhost:3000/api/projects', userACookie)),
      200
    );
    expect((await listRes.json()).projects.length).toBeGreaterThanOrEqual(1);
  });

  it('2. IDOR Matrix: User C (stranger) is completely blocked from Project A and Workflow A', async () => {
    const pCtx = { params: Promise.resolve({ id: projectAId }) };
    const wCtx = { params: Promise.resolve({ id: workflowAId }) };

    await checkStatus(
      getProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userCCookie),
        pCtx
      ),
      403
    );
    await checkStatus(
      updateProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userCCookie, 'PATCH', {
          name: 'Hacked',
        }),
        pCtx
      ),
      403
    );
    await checkStatus(
      deleteProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userCCookie, 'DELETE'),
        pCtx
      ),
      403
    );
    await checkStatus(
      getMembersHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/members`, userCCookie),
        pCtx
      ),
      403
    );
    await checkStatus(
      addMemberHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/members`, userCCookie, 'POST', {
          email: 'bad@ex.com',
          role: 'editor',
        }),
        pCtx
      ),
      403
    );
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
    await checkStatus(
      getAuditLogsHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/audit`, userCCookie),
        pCtx
      ),
      403
    );
  });

  it('3. Role Matrix: Viewer can read but CANNOT mutate project, workflows, or members', async () => {
    const pCtx = { params: Promise.resolve({ id: projectAId }) };
    const wCtx = { params: Promise.resolve({ id: workflowAId }) };

    // Add User B as viewer
    const userBRow = await sql`SELECT email FROM users WHERE id = ${userBId}`;
    await checkStatus(
      addMemberHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/members`, userACookie, 'POST', {
          email: userBRow[0]!.email,
          role: 'viewer',
        }),
        pCtx
      ),
      200
    );

    const getProj = await checkStatus(
      getProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userBCookie),
        pCtx
      ),
      200
    );
    expect((await getProj.json()).project.role).toBe('viewer');
    await checkStatus(
      getWorkflowHandler(
        makeReq(`http://localhost:3000/api/workflows/${workflowAId}`, userBCookie),
        wCtx
      ),
      200
    );
    await checkStatus(
      listWorkflowsHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/workflows`, userBCookie),
        pCtx
      ),
      200
    );

    // Mutations blocked for viewer
    await checkStatus(
      updateProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userBCookie, 'PATCH', {
          name: 'Viewer Mutate',
        }),
        pCtx
      ),
      403
    );
    await checkStatus(
      deleteProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userBCookie, 'DELETE'),
        pCtx
      ),
      403
    );
    await checkStatus(
      createWorkflowHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/workflows`, userBCookie, 'POST', {
          name: 'Viewer Flow',
        }),
        pCtx
      ),
      403
    );
    await checkStatus(
      updateWorkflowHandler(
        makeReq(`http://localhost:3000/api/workflows/${workflowAId}`, userBCookie, 'PATCH', {
          name: 'Viewer Rename',
        }),
        wCtx
      ),
      403
    );
    await checkStatus(
      duplicateWorkflowHandler(
        makeReq(
          `http://localhost:3000/api/workflows/${workflowAId}/duplicate`,
          userBCookie,
          'POST'
        ),
        wCtx
      ),
      403
    );
    await checkStatus(
      deleteWorkflowHandler(
        makeReq(`http://localhost:3000/api/workflows/${workflowAId}`, userBCookie, 'DELETE'),
        wCtx
      ),
      403
    );
    await checkStatus(
      getAuditLogsHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/audit`, userBCookie),
        pCtx
      ),
      403
    );
  });

  it('4. Role Matrix: Editor CAN mutate workflows & duplicate graph, but CANNOT delete project or view audit', async () => {
    const pCtx = { params: Promise.resolve({ id: projectAId }) };
    const wCtx = { params: Promise.resolve({ id: workflowAId }) };

    // Promote to editor
    await checkStatus(
      updateMemberHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/members`, userACookie, 'PATCH', {
          userId: userBId,
          role: 'editor',
        }),
        pCtx
      ),
      200
    );

    await checkStatus(
      updateProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userBCookie, 'PATCH', {
          name: 'Alpha Project Updated',
        }),
        pCtx
      ),
      200
    );
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

    await checkStatus(
      deleteProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userBCookie, 'DELETE'),
        pCtx
      ),
      403
    );
    await checkStatus(
      addMemberHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/members`, userBCookie, 'POST', {
          email: 'test@ex.com',
          role: 'viewer',
        }),
        pCtx
      ),
      403
    );
    await checkStatus(
      getAuditLogsHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/audit`, userBCookie),
        pCtx
      ),
      403
    );
  });

  it('5. Owner controls & Audit Log verification', async () => {
    const pCtx = { params: Promise.resolve({ id: projectAId }) };

    const auditRes = await checkStatus(
      getAuditLogsHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/audit`, userACookie),
        pCtx
      ),
      200
    );
    const auditData = await auditRes.json();
    expect(auditData.logs.length).toBeGreaterThanOrEqual(3);

    const actions = auditData.logs.map((l: { action: string }) => l.action);
    expect(actions).toContain('project.create');
    expect(actions).toContain('workflow.create');
    expect(actions).toContain('project.member_add');

    await checkStatus(
      removeMemberHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/members`, userACookie, 'DELETE', {
          userId: userAId,
        }),
        pCtx
      ),
      400
    );
    await checkStatus(
      removeMemberHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/members`, userACookie, 'DELETE', {
          userId: userBId,
        }),
        pCtx
      ),
      200
    );
    await checkStatus(
      getProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userBCookie),
        pCtx
      ),
      403
    );

    await checkStatus(
      deleteProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userACookie, 'DELETE'),
        pCtx
      ),
      200
    );
    await checkStatus(
      getProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userACookie),
        pCtx
      ),
      [403, 404]
    );
  });
});
