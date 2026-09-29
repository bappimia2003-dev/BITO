import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { getDb } from '../../apps/web/src/server/db/client.js';
import {
  GET as listVariablesHandler,
  POST as createVariableHandler,
} from '../../apps/web/src/app/api/variables/route.js';
import {
  PATCH as patchVariableHandler,
  DELETE as deleteVariableHandler,
} from '../../apps/web/src/app/api/variables/[id]/route.js';
import { POST as addMemberHandler } from '../../apps/web/src/app/api/projects/[id]/members/route.js';
import {
  makeReq,
  checkStatus,
  registerTestUser,
  setupProjectAndWorkflow,
} from '../helpers/phase3Helpers.js';

describe('Phase 4: Variables Integration Suite', { timeout: 45000 }, () => {
  const sql = getDb();
  let userA: { cookie: string; id: string };
  let userB: { cookie: string; id: string };
  let userC: { cookie: string; id: string };
  let projectAId: string;
  let workflowAId: string;

  beforeAll(async () => {
    const s = randomBytes(4).toString('hex');
    userA = await registerTestUser({
      email: `owner_${s}@phase4var.test`,
      displayName: 'Owner User',
      password: 'Password123#Phase4',
    });
    userB = await registerTestUser({
      email: `viewer_${s}@phase4var.test`,
      displayName: 'Viewer User',
      password: 'Password123#Phase4',
    });
    userC = await registerTestUser({
      email: `intruder_${s}@phase4var.test`,
      displayName: 'Intruder User',
      password: 'Password123#Phase4',
    });

    const setup = await setupProjectAndWorkflow(userA.cookie, sql);
    projectAId = setup.projectId;
    workflowAId = setup.workflowId;

    // Add User B as viewer in Project A
    const addRes = await checkStatus(
      addMemberHandler(
        makeReq(`http://localhost:3000/api/projects/${projectAId}/members`, userA.cookie, 'POST', {
          email: `viewer_${s}@phase4var.test`,
          role: 'viewer',
        }),
        { params: Promise.resolve({ id: projectAId }) }
      ),
      200
    );
    expect(addRes.status).toBe(200);
  });

  it('manages variables across global, project, and workflow scopes with RBAC isolation', async () => {
    // 1. Global scope variable by User A
    const globalRes = await checkStatus(
      createVariableHandler(
        makeReq('http://localhost:3000/api/variables', userA.cookie, 'POST', {
          scope: 'global',
          key: 'USER_THEME',
          value: 'midnight',
        })
      ),
      200
    );
    const globalVar = (await globalRes.json()).variable;
    expect(globalVar.key).toBe('USER_THEME');
    expect(globalVar.value).toBe('midnight');

    // User B cannot see User A's global variable
    const userBGlobalRes = await checkStatus(
      listVariablesHandler(
        makeReq('http://localhost:3000/api/variables?scope=global', userB.cookie)
      ),
      200
    );
    const userBGlobal = (await userBGlobalRes.json()).variables;
    expect(userBGlobal.find((v: { key: string }) => v.key === 'USER_THEME')).toBeUndefined();

    // 2. Project scope variable
    const projVarRes = await checkStatus(
      createVariableHandler(
        makeReq('http://localhost:3000/api/variables', userA.cookie, 'POST', {
          scope: 'project',
          projectId: projectAId,
          key: 'API_ENDPOINT',
          value: { host: 'api.example.com', timeout: 5000 },
        })
      ),
      200
    );
    const projVar = (await projVarRes.json()).variable;
    expect(projVar.value.host).toBe('api.example.com');

    // User B (viewer) can read project variable
    const viewerListRes = await checkStatus(
      listVariablesHandler(
        makeReq(
          `http://localhost:3000/api/variables?scope=project&projectId=${projectAId}`,
          userB.cookie
        )
      ),
      200
    );
    const viewerVars = (await viewerListRes.json()).variables;
    expect(viewerVars.find((v: { key: string }) => v.key === 'API_ENDPOINT')).toBeDefined();

    // User B (viewer) CANNOT create project variables -> 403
    const viewerCreateRes = await createVariableHandler(
      makeReq('http://localhost:3000/api/variables', userB.cookie, 'POST', {
        scope: 'project',
        projectId: projectAId,
        key: 'VIEWER_MUTATE',
        value: 123,
      })
    );
    expect(viewerCreateRes.status).toBe(403);

    // User C (intruder) CANNOT read project variables -> 403
    const intruderListRes = await listVariablesHandler(
      makeReq(
        `http://localhost:3000/api/variables?scope=project&projectId=${projectAId}`,
        userC.cookie
      )
    );
    expect(intruderListRes.status).toBe(403);

    // 3. Workflow scope variable & regex validation
    const badKeyRes = await createVariableHandler(
      makeReq('http://localhost:3000/api/variables', userA.cookie, 'POST', {
        scope: 'workflow',
        workflowId: workflowAId,
        key: '123_invalid_key',
        value: 'bad',
      })
    );
    expect(badKeyRes.status).toBe(400);

    const wfVarRes = await checkStatus(
      createVariableHandler(
        makeReq('http://localhost:3000/api/variables', userA.cookie, 'POST', {
          scope: 'workflow',
          workflowId: workflowAId,
          key: 'BATCH_SIZE',
          value: 100,
        })
      ),
      200
    );
    const wfVar = (await wfVarRes.json()).variable;
    expect(wfVar.key).toBe('BATCH_SIZE');
    expect(wfVar.value).toBe(100);

    // 4. Update and delete variable
    const updateRes = await checkStatus(
      patchVariableHandler(
        makeReq(`http://localhost:3000/api/variables/${wfVar.id}`, userA.cookie, 'PATCH', {
          value: 200,
        }),
        { params: Promise.resolve({ id: wfVar.id }) }
      ),
      200
    );
    const updated = (await updateRes.json()).variable;
    expect(updated.value).toBe(200);

    const deleteRes = await checkStatus(
      deleteVariableHandler(
        makeReq(`http://localhost:3000/api/variables/${wfVar.id}`, userA.cookie, 'DELETE'),
        { params: Promise.resolve({ id: wfVar.id }) }
      ),
      200
    );
    expect((await deleteRes.json()).ok).toBe(true);
  });
});
