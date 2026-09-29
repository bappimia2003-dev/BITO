import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { defaultNodeRegistry } from '../../packages/engine/src/index.js';
import { initializeRegistry } from '../../packages/nodes/src/registry.js';
import { makeReq, registerTestUser } from '../helpers/phase3Helpers.js';
import {
  GET as getWorkflowHandler,
  PATCH as patchWorkflowHandler,
} from '../../apps/web/src/app/api/workflows/[id]/route.js';
import { POST as validateWorkflowHandler } from '../../apps/web/src/app/api/workflows/[id]/validate/route.js';
import { POST as previewExpressionHandler } from '../../apps/web/src/app/api/workflows/[id]/expressions/preview/route.js';
import { POST as runWorkflowHandler } from '../../apps/web/src/app/api/workflows/[id]/run/route.js';
import { GET as getExecutionHandler } from '../../apps/web/src/app/api/executions/[id]/route.js';
import { GET as getExecutionLogsHandler } from '../../apps/web/src/app/api/executions/[id]/logs/route.js';
import { GET as listProjectExecutionsHandler } from '../../apps/web/src/app/api/projects/[id]/executions/route.js';

describe('Phase 7 Editor & Execution APIs Integration Tests', { timeout: 45000 }, () => {
  let sql: Sql;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  let ownerCookie = '';
  let ownerId = '';
  let strangerCookie = '';
  let projectId = '';
  let workflowId = '';
  const triggerNodeId = randomUUID();
  const setNodeId = randomUUID();

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 5 });
    initializeRegistry(defaultNodeRegistry);

    const owner = await registerTestUser({
      email: `p7_owner_${Date.now()}@example.com`,
      displayName: 'Editor Owner',
      password: 'ValidPassword123!',
    });
    ownerCookie = owner.cookie;
    ownerId = owner.id;

    const stranger = await registerTestUser({
      email: `p7_stranger_${Date.now()}@example.com`,
      displayName: 'Editor Stranger',
      password: 'ValidPassword123!',
    });
    strangerCookie = stranger.cookie;

    const [proj] = await sql`
      INSERT INTO projects (name, owner_id)
      VALUES (${'Editor Test Proj ' + Date.now()}, ${ownerId})
      RETURNING id
    `;
    projectId = proj!.id;
    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${projectId}, ${ownerId}, 'owner')
    `;

    const [wf] = await sql`
      INSERT INTO workflows (project_id, name, description, status, revision, created_by)
      VALUES (${projectId}, 'Editor Test Workflow', 'Testing editor APIs', 'draft', 1, ${ownerId})
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

  it('1. GET /api/workflows/:id returns workflow metadata and empty initial graph', async () => {
    const req = makeReq(`http://localhost/api/workflows/${workflowId}`, ownerCookie, 'GET');
    const res = await getWorkflowHandler(req, { params: Promise.resolve({ id: workflowId }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.workflow.id).toBe(workflowId);
    expect(data.workflow.name).toBe('Editor Test Workflow');
    expect(data.workflow.revision).toBe(1);
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(Array.isArray(data.connections)).toBe(true);
  });

  it('2. GET /api/workflows/:id rejects unauthorized stranger with 403', async () => {
    const req = makeReq(`http://localhost/api/workflows/${workflowId}`, strangerCookie, 'GET');
    const res = await getWorkflowHandler(req, { params: Promise.resolve({ id: workflowId }) });
    expect(res.status).toBe(403);
  });

  it('3. PATCH /api/workflows/:id atomically updates graph and increments revision', async () => {
    const payload = {
      expectedRevision: 1,
      name: 'Renamed Workflow',
      nodes: [
        {
          id: triggerNodeId,
          key: 'manual_trigger',
          type: 'trigger.manual',
          typeVersion: 1,
          name: 'Manual Trigger',
          positionX: 100,
          positionY: 200,
          config: {},
          settings: {},
        },
        {
          id: setNodeId,
          key: 'transform',
          type: 'data.set',
          typeVersion: 1,
          name: 'Transform Data',
          positionX: 350,
          positionY: 200,
          config: {
            assignments: [{ name: 'greeting', value: 'hello world', type: 'string' }],
          },
          settings: {},
        },
      ],
      connections: [
        {
          sourceNodeId: triggerNodeId,
          sourcePort: 'main',
          targetNodeId: setNodeId,
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
    expect(data.workflow.name).toBe('Renamed Workflow');
    expect(data.workflow.revision).toBe(2);
    expect(data.nodes.length).toBe(2);
    expect(data.connections.length).toBe(1);

    // Verify DB persistence
    const dbNodes = await sql`SELECT id, key FROM nodes WHERE workflow_id = ${workflowId}`;
    expect(dbNodes.length).toBe(2);
  });

  it('4. PATCH /api/workflows/:id returns 409 on revision conflict', async () => {
    const stalePayload = {
      expectedRevision: 1, // Current is now 2!
      name: 'Stale Update',
    };

    const req = makeReq(
      `http://localhost/api/workflows/${workflowId}`,
      ownerCookie,
      'PATCH',
      stalePayload
    );
    const res = await patchWorkflowHandler(req, { params: Promise.resolve({ id: workflowId }) });
    expect(res.status).toBe(409);

    const errData = await res.json();
    expect(errData.error.code).toBe('REVISION_CONFLICT');
    expect(errData.error.details.currentRevision).toBe(2);
  });

  it('5. POST /api/workflows/:id/validate returns validation results', async () => {
    // Valid graph
    const req = makeReq(
      `http://localhost/api/workflows/${workflowId}/validate`,
      ownerCookie,
      'POST',
      {}
    );
    const res = await validateWorkflowHandler(req, { params: Promise.resolve({ id: workflowId }) });
    expect(res.status).toBe(200);
    const validData = await res.json();
    expect(validData.isValid).toBe(true);
    expect(validData.errorCount).toBe(0);

    // Invalid graph with duplicate key
    const reqInvalid = makeReq(
      `http://localhost/api/workflows/${workflowId}/validate`,
      ownerCookie,
      'POST',
      {
        nodes: [
          { id: randomUUID(), key: 'dup_key', type: 'trigger.manual', name: 'Trigger 1' },
          { id: randomUUID(), key: 'dup_key', type: 'trigger.manual', name: 'Trigger 2' },
        ],
        connections: [],
      }
    );
    const resInvalid = await validateWorkflowHandler(reqInvalid, {
      params: Promise.resolve({ id: workflowId }),
    });
    expect(resInvalid.status).toBe(200);
    const invalidData = await resInvalid.json();
    expect(invalidData.isValid).toBe(false);
    expect(invalidData.errorCount).toBeGreaterThan(0);
    expect(invalidData.issues.some((i: { code: string }) => i.code === 'DUPLICATE_KEY')).toBe(true);
  });

  it('6. POST /api/workflows/:id/expressions/preview evaluates template expressions', async () => {
    const req = makeReq(
      `http://localhost/api/workflows/${workflowId}/expressions/preview`,
      ownerCookie,
      'POST',
      {
        expression: 'Hello {{ input.user }}!',
        sampleInput: { user: 'Alice' },
      }
    );
    const res = await previewExpressionHandler(req, {
      params: Promise.resolve({ id: workflowId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.result).toBe('Hello Alice!');
  });

  let createdExecutionId = '';

  it('7. POST /api/workflows/:id/run triggers execution and advances runTick', async () => {
    const req = makeReq(`http://localhost/api/workflows/${workflowId}/run`, ownerCookie, 'POST', {
      payload: { initialValue: 42 },
    });
    const res = await runWorkflowHandler(req, { params: Promise.resolve({ id: workflowId }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.executionId).toBeDefined();
    createdExecutionId = data.executionId;
  });

  it('8. GET /api/executions/:id returns execution details and node runs', async () => {
    expect(createdExecutionId).toBeTruthy();

    const req = makeReq(
      `http://localhost/api/executions/${createdExecutionId}`,
      ownerCookie,
      'GET'
    );
    const res = await getExecutionHandler(req, {
      params: Promise.resolve({ id: createdExecutionId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.execution.id).toBe(createdExecutionId);
    expect(data.execution.workflowId).toBe(workflowId);
    expect(Array.isArray(data.nodeRuns)).toBe(true);
  });

  it('9. GET /api/executions/:id/logs returns execution logs', async () => {
    expect(createdExecutionId).toBeTruthy();

    const req = makeReq(
      `http://localhost/api/executions/${createdExecutionId}/logs`,
      ownerCookie,
      'GET'
    );
    const res = await getExecutionLogsHandler(req, {
      params: Promise.resolve({ id: createdExecutionId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data.logs)).toBe(true);
  });

  it('10. GET /api/projects/:id/executions lists project executions', async () => {
    const req = makeReq(
      `http://localhost/api/projects/${projectId}/executions?workflowId=${workflowId}`,
      ownerCookie,
      'GET'
    );
    const res = await listProjectExecutionsHandler(req, {
      params: Promise.resolve({ id: projectId }),
    });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data.executions)).toBe(true);
    expect(data.executions.some((e: { id: string }) => e.id === createdExecutionId)).toBe(true);
  });
});
