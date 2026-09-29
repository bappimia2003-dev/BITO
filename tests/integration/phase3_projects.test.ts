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
import { GET as getAuditLogsHandler } from '../../apps/web/src/app/api/projects/[id]/audit/route.js';
import {
  makeReq,
  checkStatus,
  registerTestUser,
  setupProjectAndWorkflow,
} from '../helpers/phase3Helpers.js';

describe('Phase 3 Projects & Roles Integration Tests', { timeout: 30000 }, () => {
  let sql: Sql;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  let userACookie = '',
    userBCookie = '',
    userCCookie = '';
  let userAId = '',
    userBId = '',
    userCId = '';
  let projectAId = '';

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 5 });
    await sql`DELETE FROM rate_limits`;

    const uA = await registerTestUser({
      email: `p3_proj_a_${Date.now()}@example.com`,
      displayName: 'Owner A',
      password: 'ValidPassword123!',
    });
    userACookie = uA.cookie;
    userAId = uA.id;

    const uB = await registerTestUser({
      email: `p3_proj_b_${Date.now()}@example.com`,
      displayName: 'Member B',
      password: 'ValidPassword123!',
    });
    userBCookie = uB.cookie;
    userBId = uB.id;

    const uC = await registerTestUser({
      email: `p3_proj_c_${Date.now()}@example.com`,
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

  it('1. User A creates Project A and lists projects', async () => {
    const setup = await setupProjectAndWorkflow(userACookie, sql);
    projectAId = setup.projectId;

    const listRes = await checkStatus(
      listProjectsHandler(makeReq('http://localhost:3000/api/projects', userACookie)),
      200
    );
    expect((await listRes.json()).projects.length).toBeGreaterThanOrEqual(1);
  });

  it('2. IDOR: Stranger User C is blocked from Project A and its members', async () => {
    const pCtx = { params: Promise.resolve({ id: projectAId }) };

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
      getAuditLogsHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/audit`, userCCookie),
        pCtx
      ),
      403
    );
  });

  it('3. Member permissions & RBAC: viewer cannot mutate project or add members', async () => {
    const pCtx = { params: Promise.resolve({ id: projectAId }) };

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
  });

  it('4. Owner management, sole owner defense, and audit trail', async () => {
    const pCtx = { params: Promise.resolve({ id: projectAId }) };

    // Editor promotion test
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

    // Editor cannot delete project or add members
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

    // Audit logs visible to owner
    const auditRes = await checkStatus(
      getAuditLogsHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/audit`, userACookie),
        pCtx
      ),
      200
    );
    const auditData = await auditRes.json();
    expect(auditData.logs.length).toBeGreaterThanOrEqual(2);

    // Sole owner cannot remove self
    await checkStatus(
      removeMemberHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/members`, userACookie, 'DELETE', {
          userId: userAId,
        }),
        pCtx
      ),
      400
    );

    // Remove member B
    await checkStatus(
      removeMemberHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/members`, userACookie, 'DELETE', {
          userId: userBId,
        }),
        pCtx
      ),
      200
    );

    // Delete project
    await checkStatus(
      deleteProjectHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}`, userACookie, 'DELETE'),
        pCtx
      ),
      200
    );
  });
});
