import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { getDb } from '../../apps/web/src/server/db/client.js';
import {
  POST as createCredentialHandler,
  GET as listCredentialsHandler,
} from '../../apps/web/src/app/api/credentials/route.js';
import {
  GET as getCredentialHandler,
  PATCH as patchCredentialHandler,
  DELETE as deleteCredentialHandler,
} from '../../apps/web/src/app/api/credentials/[id]/route.js';
import { GET as getDependenciesHandler } from '../../apps/web/src/app/api/credentials/[id]/dependencies/route.js';
import { POST as testCredentialHandler } from '../../apps/web/src/app/api/credentials/[id]/test/route.js';
import { hashSessionToken } from '../../apps/web/src/server/repositories/sessions.js';
import {
  makeReq,
  checkStatus,
  registerTestUser,
  setupProjectAndWorkflow,
} from '../helpers/phase3Helpers.js';

describe('Phase 4: Credentials Manager Integration Suite', { timeout: 45000 }, () => {
  const sql = getDb();
  let userA: { cookie: string; id: string };
  let projectAId: string;
  let workflowAId: string;

  beforeAll(async () => {
    const s = randomBytes(4).toString('hex');
    userA = await registerTestUser({
      email: `owner_${s}@phase4cred.test`,
      displayName: 'Owner User',
      password: 'Password123#Phase4',
    });

    const setup = await setupProjectAndWorkflow(userA.cookie, sql);
    projectAId = setup.projectId;
    workflowAId = setup.workflowId;
  });

  it('performs credential CRUD, encryption in DB, and masked hint verification', async () => {
    const rawBotToken = '123456:ABC-DEF1234ghIkl-zyx57W2v1u1234abcd';

    // 1. Create credential
    const createRes = await checkStatus(
      createCredentialHandler(
        makeReq('http://localhost:3000/api/credentials', userA.cookie, 'POST', {
          projectId: projectAId,
          name: 'Telegram Bot Prod',
          type: 'telegramBot',
          data: { botToken: rawBotToken, botUsername: '@test_bot' },
        })
      ),
      200
    );
    const createData = await createRes.json();
    const credId = createData.credential.id;

    // 2. Verify masked hint in API response
    expect(createData.credential.hint.tokenTail).toBe('••••••abcd');
    expect(createData.credential.hint.botUsername).toBe('@test_bot');
    expect(createData.credential.usedByCount).toBe(0);

    // 3. Verify DB record: ciphertext is encrypted, never plaintext
    const [dbRow] = await sql`
      SELECT ciphertext, iv, auth_tag, key_version, hint
      FROM credentials WHERE id = ${credId}
    `;
    expect(dbRow!.ciphertext).toBeDefined();
    expect(dbRow!.iv).toBeDefined();
    expect(dbRow!.auth_tag).toBeDefined();
    expect(dbRow!.key_version).toBe(1);
    expect(dbRow!.ciphertext.toString('utf8')).not.toContain(rawBotToken);

    // 4. List credentials
    const listRes = await checkStatus(
      listCredentialsHandler(
        makeReq(`http://localhost:3000/api/credentials?projectId=${projectAId}`, userA.cookie)
      ),
      200
    );
    const listData = await listRes.json();
    expect(listData.credentials.length).toBeGreaterThan(0);
    const found = listData.credentials.find((c: { id: string }) => c.id === credId);
    expect(found).toBeDefined();
    expect(found.hint.tokenTail).toBe('••••••abcd');

    // 5. Replace secret
    const newBotToken = '654321:XYZ-DEF5678ghIkl-zyx57W2v1u5678wxyz';
    const patchRes = await checkStatus(
      patchCredentialHandler(
        makeReq(`http://localhost:3000/api/credentials/${credId}`, userA.cookie, 'PATCH', {
          data: { botToken: newBotToken, botUsername: '@new_bot' },
        }),
        { params: Promise.resolve({ id: credId }) }
      ),
      200
    );
    const patchData = await patchRes.json();
    expect(patchData.credential.hint.tokenTail).toBe('••••••wxyz');
    expect(patchData.credential.hint.botUsername).toBe('@new_bot');
  });

  it('snapshot test: strictly verifies no endpoint leaks raw secrets or crypto keys', async () => {
    const rawSecret = 'SUPER_SECRET_TOKEN_VALUE_XYZ_98765';

    const createRes = await checkStatus(
      createCredentialHandler(
        makeReq('http://localhost:3000/api/credentials', userA.cookie, 'POST', {
          projectId: projectAId,
          name: 'Bearer Token API',
          type: 'httpBearer',
          data: { token: rawSecret },
        })
      ),
      200
    );
    const createData = await createRes.json();
    const credId = createData.credential.id;

    // Test GET list
    const listRes = await listCredentialsHandler(
      makeReq(`http://localhost:3000/api/credentials?projectId=${projectAId}`, userA.cookie)
    );
    const listBody = await listRes.text();

    // Test GET single
    const getRes = await getCredentialHandler(
      makeReq(`http://localhost:3000/api/credentials/${credId}`, userA.cookie),
      { params: Promise.resolve({ id: credId }) }
    );
    const getBody = await getRes.text();

    // Verify raw secret string NEVER appears in responses
    expect(listBody).not.toContain(rawSecret);
    expect(getBody).not.toContain(rawSecret);

    // Verify internal crypto columns NEVER returned to frontend
    const forbiddenKeys = [
      'ciphertext',
      'iv',
      'auth_tag',
      'authTag',
      'token',
      'botToken',
      'apiKey',
      'accessToken',
      'appSecret',
      'verifyToken',
      'pageAccessToken',
      'password',
      'headerValue',
    ];

    const parsedGet = JSON.parse(getBody);
    for (const key of forbiddenKeys) {
      expect(parsedGet.credential).not.toHaveProperty(key);
      expect(parsedGet.credential.hint).not.toHaveProperty(key);
    }
  });

  it('enforces re-auth gating on sensitive actions (create, replace, delete)', async () => {
    // Expire user's session last_auth_at to 10 minutes ago
    const oldAuthDate = new Date(Date.now() - 600 * 1000).toISOString();
    const token = userA.cookie.split('=')[1]!;
    const tokenHash = hashSessionToken(token);

    const updateRes = await sql`
      UPDATE sessions
      SET last_auth_at = ${oldAuthDate}
      WHERE token_hash = ${tokenHash}
      RETURNING id
    `;
    expect(updateRes.length).toBe(1);

    // 1. Attempt create -> 401 REAUTH_REQUIRED
    const createRes = await createCredentialHandler(
      makeReq('http://localhost:3000/api/credentials', userA.cookie, 'POST', {
        projectId: projectAId,
        name: 'Reauth Test Cred',
        type: 'httpBearer',
        data: { token: 'token123' },
      })
    );
    expect(createRes.status).toBe(401);
    const createJson = await createRes.json();
    expect(createJson.error.code).toBe('REAUTH_REQUIRED');

    // Restore last_auth_at for remaining tests
    await sql`
      UPDATE sessions
      SET last_auth_at = NOW()
      WHERE token_hash = ${tokenHash}
    `;
  });

  it('rejects credential deletion with 409 CREDENTIAL_IN_USE when referenced by a node', async () => {
    // 1. Create a credential
    const createRes = await checkStatus(
      createCredentialHandler(
        makeReq('http://localhost:3000/api/credentials', userA.cookie, 'POST', {
          projectId: projectAId,
          name: 'Protected In-Use Credential',
          type: 'geminiApiKey',
          data: { apiKey: 'AIzaSyProtectedApiKey123' },
        })
      ),
      200
    );
    const cred = (await createRes.json()).credential;

    // 2. Insert a fixture node row in DB referencing this credential
    const [fixtureNode] = await sql`
      INSERT INTO nodes (workflow_id, key, type, name, credential_id, position_x, position_y)
      VALUES (${workflowAId}, 'gemini_ai', 'gemini.generate', 'Gemini Node', ${cred.id}, 200, 200)
      RETURNING id, key, type
    `;

    // 3. Dependencies endpoint returns the dependent node
    const depRes = await checkStatus(
      getDependenciesHandler(
        makeReq(`http://localhost:3000/api/credentials/${cred.id}/dependencies`, userA.cookie),
        { params: Promise.resolve({ id: cred.id }) }
      ),
      200
    );
    const depData = await depRes.json();
    expect(depData.dependents.length).toBe(1);
    expect(depData.dependents[0].nodeId).toBe(fixtureNode!.id);
    expect(depData.dependents[0].nodeKey).toBe('gemini_ai');

    // 4. Attempt DELETE -> returns 409 CREDENTIAL_IN_USE
    const delRes = await deleteCredentialHandler(
      makeReq(`http://localhost:3000/api/credentials/${cred.id}`, userA.cookie, 'DELETE'),
      { params: Promise.resolve({ id: cred.id }) }
    );
    expect(delRes.status).toBe(409);
    const delData = await delRes.json();
    expect(delData.error.code).toBe('CREDENTIAL_IN_USE');
    expect(delData.error.details.dependents.length).toBe(1);

    // 5. Delete fixture node
    await sql`DELETE FROM nodes WHERE id = ${fixtureNode!.id}`;

    // 6. DELETE now succeeds with 200
    const finalDelRes = await checkStatus(
      deleteCredentialHandler(
        makeReq(`http://localhost:3000/api/credentials/${cred.id}`, userA.cookie, 'DELETE'),
        { params: Promise.resolve({ id: cred.id }) }
      ),
      200
    );
    const finalDelData = await finalDelRes.json();
    expect(finalDelData.ok).toBe(true);
  });

  it('tests connection endpoint with rate limiting (10/min)', async () => {
    // 1. Create a telegram credential
    const createRes = await checkStatus(
      createCredentialHandler(
        makeReq('http://localhost:3000/api/credentials', userA.cookie, 'POST', {
          projectId: projectAId,
          name: 'Rate Limit Test Cred',
          type: 'telegramBot',
          data: { botToken: 'test_token_123', botUsername: '@test' },
        })
      ),
      200
    );
    const credId = (await createRes.json()).credential.id;

    // 2. Perform 1 test request (within rate limit) -> 200
    const res = await testCredentialHandler(
      makeReq(`http://localhost:3000/api/credentials/${credId}/test`, userA.cookie, 'POST'),
      { params: Promise.resolve({ id: credId }) }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('ok');
    expect(data).toHaveProperty('message');

    // 3. Atomically advance bucket count to 10 for this window
    const now = Date.now();
    const windowMs = 60 * 1000;
    const bucketTime = Math.floor(now / windowMs) * windowMs;
    const windowStart = new Date(bucketTime);
    await sql`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${`cred_test:${credId}`}, ${windowStart}, 10)
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = 10
    `;

    // 4. The 11th request triggers 429 RATE_LIMITED
    const rateLimitedRes = await testCredentialHandler(
      makeReq(`http://localhost:3000/api/credentials/${credId}/test`, userA.cookie, 'POST'),
      { params: Promise.resolve({ id: credId }) }
    );
    expect(rateLimitedRes.status).toBe(429);
    const rlData = await rateLimitedRes.json();
    expect(rlData.error.code).toBe('RATE_LIMITED');
  });
});
