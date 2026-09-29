import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { defaultNodeRegistry } from '../../packages/engine/src/index.js';
import { initializeRegistry } from '../../packages/nodes/src/registry.js';
import { registerTestUser } from '../helpers/phase3Helpers.js';
import {
  activateWorkflow,
  deactivateWorkflow,
} from '../../apps/web/src/server/workflow/workflowActivation.js';
import {
  listWebhooksForWorkflow,
  rotateWebhookTokenAndSecret,
} from '../../apps/web/src/server/repositories/webhooks.js';
import {
  POST as webhookRouteHandler,
  PUT as webhookPutHandler,
} from '../../apps/web/src/app/api/hooks/[token]/route.js';

describe('Phase 8 Webhooks Ingestion & Security Tests', { timeout: 60000 }, () => {
  let sql: Sql;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  let ownerId = '';
  let projectId = '';
  let workflowId = '';
  const triggerNodeId = crypto.randomUUID();
  const setNodeId = crypto.randomUUID();

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 5 });
    initializeRegistry(defaultNodeRegistry);

    const owner = await registerTestUser({
      email: `p8_hook_${Date.now()}@example.com`,
      displayName: 'Webhook Tester',
      password: 'ValidPassword123!',
    });
    ownerId = owner.id;

    const [proj] = await sql`
      INSERT INTO projects (name, owner_id)
      VALUES (${'Webhook Proj ' + Date.now()}, ${ownerId})
      RETURNING id
    `;
    projectId = proj!.id;
    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${projectId}, ${ownerId}, 'owner')
    `;

    const [wf] = await sql`
      INSERT INTO workflows (project_id, name, description, status, revision, created_by)
      VALUES (${projectId}, 'Webhook Workflow', 'Testing webhook pipeline', 'draft', 1, ${ownerId})
      RETURNING id
    `;
    workflowId = wf!.id;

    // Create trigger.webhook node and data.set node
    await sql`
      INSERT INTO nodes (id, workflow_id, key, type, type_version, name, position_x, position_y, config, settings)
      VALUES
        (${triggerNodeId}, ${workflowId}, 'webhook', 'trigger.webhook', 1, 'Webhook Trigger', 100, 100,
         ${sql.json({ methods: ['POST'], requireSignature: true })}, '{}'::jsonb),
        (${setNodeId}, ${workflowId}, 'set_data', 'data.set', 1, 'Set Data', 300, 100,
         ${sql.json({ values: { received: '{{input.body}}' } })}, '{}'::jsonb)
    `;

    await sql`
      INSERT INTO connections (workflow_id, source_node_id, source_port, target_node_id, target_port)
      VALUES (${workflowId}, ${triggerNodeId}, 'main', ${setNodeId}, 'main')
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

  let endpointToken = '';
  let endpointSecret = '';
  let endpointId = '';

  it('1. Activates workflow and provisions webhook endpoint with token and secret', async () => {
    const activation = await activateWorkflow({ userId: ownerId }, workflowId);
    expect(activation.ok).toBe(true);

    const endpoints = await listWebhooksForWorkflow(workflowId);
    expect(endpoints.length).toBe(1);
    const ep = endpoints[0]!;
    expect(ep.token).toBeDefined();
    expect(ep.secret).toBeDefined();
    expect(ep.isActive).toBe(true);

    endpointToken = ep.token;
    endpointSecret = ep.secret!;
    endpointId = ep.id;
  });

  it('2. Method allowed check: rejects disallowed HTTP method with 405', async () => {
    const req = new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    const res = await webhookPutHandler(req, {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(res.status).toBe(405);
    const data = await res.json();
    expect(data.error.code).toBe('METHOD_NOT_ALLOWED');
  });

  it('3. Unknown or inactive token returns 404', async () => {
    const req = new Request('http://localhost:3000/api/hooks/non_existent_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });

    const res = await webhookRouteHandler(req, {
      params: Promise.resolve({ token: 'non_existent_token' }),
    });
    expect(res.status).toBe(404);
  });

  it('4. Payload size cap: rejects body > 1MB with 413', async () => {
    const largeBody = 'a'.repeat(1024 * 1024 + 10);
    const req = new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': String(largeBody.length),
      },
      body: largeBody,
    });

    const res = await webhookRouteHandler(req, {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(res.status).toBe(413);
  });

  it('5. Signature verification: rejects missing headers with 401', async () => {
    const req = new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'test' }),
    });

    const res = await webhookRouteHandler(req, {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(res.status).toBe(401);
  });

  it('6. Signature verification: rejects timestamp outside replay window with 401', async () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400; // 400s ago (> 300s)
    const rawBody = JSON.stringify({ event: 'test' });
    const sig = crypto
      .createHmac('sha256', endpointSecret)
      .update(`${oldTimestamp}.${rawBody}`)
      .digest('hex');

    const req = new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bito-Timestamp': String(oldTimestamp),
        'X-Bito-Signature': `sha256=${sig}`,
      },
      body: rawBody,
    });

    const res = await webhookRouteHandler(req, {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(res.status).toBe(401);
  });

  it('7. Signature verification: rejects invalid/tampered signature with 401', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify({ event: 'test' });

    const req = new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bito-Timestamp': String(nowSec),
        'X-Bito-Signature':
          'sha256=invalidhexsignature000000000000000000000000000000000000000000000000',
      },
      body: rawBody,
    });

    const res = await webhookRouteHandler(req, {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(res.status).toBe(401);
  });

  it('8. Valid signature: triggers workflow execution and responds 200 with executionId', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify({ message: 'Hello from Webhook', amount: 42 });
    const sig = crypto
      .createHmac('sha256', endpointSecret)
      .update(`${nowSec}.${rawBody}`)
      .digest('hex');

    const req = new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bito-Timestamp': String(nowSec),
        'X-Bito-Signature': `sha256=${sig}`,
      },
      body: rawBody,
    });

    const res = await webhookRouteHandler(req, {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.executionId).toBeDefined();

    // Verify execution record created in DB
    const [exec] =
      await sql`SELECT id, mode, status FROM executions WHERE id = ${data.executionId}`;
    expect(exec).toBeDefined();
    expect(exec!.mode).toBe('trigger');
  });

  it('9. Replay / Duplicate protection: re-sending same payload and signature returns duplicate: true without new execution', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify({ orderId: 'ord-123', status: 'paid' });
    const sig = crypto
      .createHmac('sha256', endpointSecret)
      .update(`${nowSec}.${rawBody}`)
      .digest('hex');

    const makeCall = () =>
      new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bito-Timestamp': String(nowSec),
          'X-Bito-Signature': `sha256=${sig}`,
        },
        body: rawBody,
      });

    // First call
    const res1 = await webhookRouteHandler(makeCall(), {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(res1.status).toBe(200);
    const data1 = await res1.json();
    expect(data1.executionId).toBeDefined();

    // Duplicate call
    const res2 = await webhookRouteHandler(makeCall(), {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(res2.status).toBe(200);
    const data2 = await res2.json();
    expect(data2.ok).toBe(true);
    expect(data2.duplicate).toBe(true);
    expect(data2.executionId).toBeUndefined();
  });

  it('10. Idempotency-Key header duplicate protection', async () => {
    const key = `idem_${Date.now()}_${Math.random()}`;
    const nowSec = Math.floor(Date.now() / 1000);
    const rawBody = JSON.stringify({ event: 'invoice.created' });
    const sig = crypto
      .createHmac('sha256', endpointSecret)
      .update(`${nowSec}.${rawBody}`)
      .digest('hex');

    const makeCall = () =>
      new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
          'X-Bito-Timestamp': String(nowSec),
          'X-Bito-Signature': `sha256=${sig}`,
        },
        body: rawBody,
      });

    const res1 = await webhookRouteHandler(makeCall(), {
      params: Promise.resolve({ token: endpointToken }),
    });
    const data1 = await res1.json();
    expect(data1.executionId).toBeDefined();

    const res2 = await webhookRouteHandler(makeCall(), {
      params: Promise.resolve({ token: endpointToken }),
    });
    const data2 = await res2.json();
    expect(data2.duplicate).toBe(true);
  });

  it('11. Malformed JSON returns 400 Bad Request', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const badBody = '{ invalid json : true ';
    const sig = crypto
      .createHmac('sha256', endpointSecret)
      .update(`${nowSec}.${badBody}`)
      .digest('hex');

    const req = new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bito-Timestamp': String(nowSec),
        'X-Bito-Signature': `sha256=${sig}`,
      },
      body: badBody,
    });

    const res = await webhookRouteHandler(req, {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(res.status).toBe(400);
  });

  it('12. Rotating webhook secret invalidates old token and issues fresh working token', async () => {
    const rotation = await rotateWebhookTokenAndSecret(endpointId, workflowId);
    expect(rotation.token).not.toBe(endpointToken);
    expect(rotation.secret).not.toBe(endpointSecret);

    // Old token should now return 404
    const oldReq = new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ping: true }),
    });
    const oldRes = await webhookRouteHandler(oldReq, {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(oldRes.status).toBe(404);

    // New token works with new secret
    const nowSec = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ ping: 'pong' });
    const newSig = crypto
      .createHmac('sha256', rotation.secret)
      .update(`${nowSec}.${body}`)
      .digest('hex');

    const newReq = new Request(`http://localhost:3000/api/hooks/${rotation.token}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bito-Timestamp': String(nowSec),
        'X-Bito-Signature': `sha256=${newSig}`,
      },
      body,
    });
    const newRes = await webhookRouteHandler(newReq, {
      params: Promise.resolve({ token: rotation.token }),
    });
    expect(newRes.status).toBe(200);

    endpointToken = rotation.token;
    endpointSecret = rotation.secret;
  });

  it('13. Deactivating workflow deactivates endpoint and returns 404', async () => {
    await deactivateWorkflow({ userId: ownerId }, workflowId);

    const nowSec = Math.floor(Date.now() / 1000);
    const body = JSON.stringify({ test: 'deactivated' });
    const sig = crypto
      .createHmac('sha256', endpointSecret)
      .update(`${nowSec}.${body}`)
      .digest('hex');

    const req = new Request(`http://localhost:3000/api/hooks/${endpointToken}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Bito-Timestamp': String(nowSec),
        'X-Bito-Signature': `sha256=${sig}`,
      },
      body,
    });

    const res = await webhookRouteHandler(req, {
      params: Promise.resolve({ token: endpointToken }),
    });
    expect(res.status).toBe(404);
  });
});
