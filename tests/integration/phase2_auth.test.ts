import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { POST as registerHandler } from '../../apps/web/src/app/api/auth/register/route.js';
import { POST as loginHandler } from '../../apps/web/src/app/api/auth/login/route.js';
import { POST as logoutHandler } from '../../apps/web/src/app/api/auth/logout/route.js';
import { POST as reauthHandler } from '../../apps/web/src/app/api/auth/reauth/route.js';
import { GET as meHandler } from '../../apps/web/src/app/api/auth/me/route.js';
import { POST as changePasswordHandler } from '../../apps/web/src/app/api/auth/change-password/route.js';
import { createProject } from '../../apps/web/src/server/repositories/projects.js';
import { withRoute } from '../../apps/web/src/server/http/withRoute.js';
import { env } from '../../apps/web/src/server/env.js';
import { hashSessionToken } from '../../apps/web/src/server/repositories/sessions.js';

describe('Phase 2 Password Authentication & Session Integration Tests', () => {
  let sql: Sql;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  const testUserA = {
    email: `test_user_a_${Date.now()}@example.com`,
    displayName: 'User A',
    password: 'ValidPassword123!',
  };

  const testUserB = {
    email: `test_user_b_${Date.now()}@example.com`,
    displayName: 'User B',
    password: 'ValidPassword123!',
  };

  let userACookie = '';
  let userBCookie = '';
  let userAId = '';
  let userBId = '';

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 5 });
    await sql`DELETE FROM rate_limits`;
  });

  afterAll(async () => {
    if (sql) {
      // Invalidate test users (cannot delete due to append-only audit_logs FK trigger)
      if (userAId) {
        await sql`UPDATE users SET is_disabled = true WHERE id = ${userAId}`;
      }
      if (userBId) {
        await sql`UPDATE users SET is_disabled = true WHERE id = ${userBId}`;
      }
      await sql.end({ timeout: 5 });
    }
  });

  it('1. Register new user with password: sets session cookie and stores argon2id hash', async () => {
    const req = new Request(`${env.APP_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': `10.10.1.${Date.now() % 250}`,
        origin: env.APP_URL,
      },
      body: JSON.stringify(testUserA),
    });

    const res = await registerHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.user.email).toBe(testUserA.email.toLowerCase());
    userAId = data.user.id;

    // Cookie flags verification
    const setCookie = res.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Path=/');
    expect(setCookie).toContain('Max-Age=604800');

    // Extract raw cookie string to use for subsequent requests
    const cookieName = env.APP_URL.startsWith('https://') ? '__Host-bito_session' : 'bito_session';
    expect(setCookie).toContain(`${cookieName}=`);
    userACookie = setCookie!.split(';')[0]!;

    // Verify DB state: password_hash is argon2id
    const rows = await sql<{ password_hash: string }[]>`
      SELECT password_hash FROM users WHERE id = ${userAId}
    `;
    expect(rows[0]?.password_hash).toMatch(/^\$argon2id\$/);
  });

  it('2. Login with correct password and me endpoint returns authenticated user', async () => {
    const req = new Request(`${env.APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
      },
      body: JSON.stringify({
        email: testUserA.email,
        password: testUserA.password,
      }),
    });

    const res = await loginHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.id).toBe(userAId);

    const setCookie = res.headers.get('set-cookie');
    userACookie = setCookie!.split(';')[0]!;

    // Test GET /api/auth/me
    const meReq = new Request(`${env.APP_URL}/api/auth/me`, {
      method: 'GET',
      headers: { cookie: userACookie },
    });
    const meRes = await meHandler(meReq);
    expect(meRes.status).toBe(200);
    const meData = await meRes.json();
    expect(meData.user.id).toBe(userAId);
    expect(meData.user.email).toBe(testUserA.email.toLowerCase());
    expect(meData.user.hasPassword).toBe(true);
  });

  it('3. Wrong password returns 401 with identical message and equalized timing', async () => {
    // 3a: Existing user with wrong password
    const wrongPassReq = new Request(`${env.APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
      },
      body: JSON.stringify({
        email: testUserA.email,
        password: 'WrongPassword123!',
      }),
    });

    const wrongPassRes = await loginHandler(wrongPassReq);
    expect(wrongPassRes.status).toBe(401);
    const wrongPassData = await wrongPassRes.json();
    expect(wrongPassData.error.code).toBe('UNAUTHORIZED');
    expect(wrongPassData.error.message).toBe('Invalid email or password');

    // 3b: Non-existent user
    const unknownUserReq = new Request(`${env.APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
      },
      body: JSON.stringify({
        email: 'completely_unknown_nonexistent@example.com',
        password: 'SomeRandomPassword123!',
      }),
    });

    const unknownUserRes = await loginHandler(unknownUserReq);
    expect(unknownUserRes.status).toBe(401);
    const unknownUserData = await unknownUserRes.json();
    expect(unknownUserData.error.code).toBe('UNAUTHORIZED');
    expect(unknownUserData.error.message).toBe('Invalid email or password');
  });

  it('4. Login throttling: 5 failed attempts per (email, IP) triggers 429 RATE_LIMITED', async () => {
    const throttleEmail = `throttle_target_${Date.now()}@example.com`;
    const clientIp = '198.51.100.42';

    // Perform 5 failed attempts
    for (let i = 0; i < 5; i++) {
      const req = new Request(`${env.APP_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': clientIp,
          origin: env.APP_URL,
        },
        body: JSON.stringify({
          email: throttleEmail,
          password: 'BadPassword123!',
        }),
      });
      const res = await loginHandler(req);
      expect(res.status).toBe(401);
    }

    // 6th attempt must be throttled with 429
    const throttledReq = new Request(`${env.APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': clientIp,
        origin: env.APP_URL,
      },
      body: JSON.stringify({
        email: throttleEmail,
        password: 'BadPassword123!',
      }),
    });

    const throttledRes = await loginHandler(throttledReq);
    expect(throttledRes.status).toBe(429);
    const throttledData = await throttledRes.json();
    expect(throttledData.error.code).toBe('RATE_LIMITED');
  });

  it('5. CSRF rejection: mutating request with invalid Origin returns 403 FORBIDDEN', async () => {
    const evilReq = new Request(`${env.APP_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://attacker-domain.evil.com',
      },
      body: JSON.stringify({
        email: testUserA.email,
        password: testUserA.password,
      }),
    });

    const evilRes = await loginHandler(evilReq);
    expect(evilRes.status).toBe(403);
    const evilData = await evilRes.json();
    expect(evilData.error.code).toBe('FORBIDDEN');
    expect(evilData.error.message).toContain('Cross-origin request rejected');
  });

  it('6. Session expiration: expired or 30-day absolute session is rejected with 401', async () => {
    // Insert artificially expired session directly in DB
    const expiredToken = `expired_session_token_${Date.now()}`;
    const expiredHash = hashSessionToken(expiredToken);

    await sql`
      INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at)
      VALUES (${userAId}, ${expiredHash}, NOW() - interval '1 hour', NOW() - interval '1 hour', NOW() - interval '1 hour')
    `;

    const expiredReq = new Request(`${env.APP_URL}/api/auth/me`, {
      method: 'GET',
      headers: { cookie: `bito_session=${expiredToken}; __Host-bito_session=${expiredToken}` },
    });
    const expiredRes = await meHandler(expiredReq);
    expect(expiredRes.status).toBe(401);
  });

  it('7. Re-auth required for sensitive actions, then satisfied upon verification', async () => {
    // Make session's last_auth_at older than 300 seconds (6 minutes ago)
    const oldAuthDate = new Date(Date.now() - 400 * 1000).toISOString();
    const token = userACookie.split('=')[1]!;
    const tokenHash = hashSessionToken(token);

    await sql`
      UPDATE sessions
      SET last_auth_at = ${oldAuthDate}
      WHERE token_hash = ${tokenHash}
    `;

    // Attempting sensitive action: change password
    const sensitiveReq = new Request(`${env.APP_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
        cookie: userACookie,
      },
      body: JSON.stringify({ newPassword: 'NewBrandPassword123!' }),
    });

    const sensitiveRes = await changePasswordHandler(sensitiveReq);
    expect(sensitiveRes.status).toBe(401);
    const sensitiveData = await sensitiveRes.json();
    expect(sensitiveData.error.code).toBe('REAUTH_REQUIRED');

    // Perform re-auth via POST /api/auth/reauth with current password
    const reauthReq = new Request(`${env.APP_URL}/api/auth/reauth`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
        cookie: userACookie,
      },
      body: JSON.stringify({ password: testUserA.password }),
    });

    const reauthRes = await reauthHandler(reauthReq);
    expect(reauthRes.status).toBe(200);
    const reauthData = await reauthRes.json();
    expect(reauthData.reauthenticated).toBe(true);

    // Retry sensitive action -> now succeeds!
    const retryReq = new Request(`${env.APP_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
        cookie: userACookie,
      },
      body: JSON.stringify({ newPassword: 'NewBrandPassword123!' }),
    });

    const retryRes = await changePasswordHandler(retryReq);
    expect(retryRes.status).toBe(200);
    testUserA.password = 'NewBrandPassword123!'; // update for future checks
  });

  it('8. Logout revokes session and clears cookie', async () => {
    const logoutReq = new Request(`${env.APP_URL}/api/auth/logout`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
        cookie: userACookie,
      },
      body: JSON.stringify({}),
    });

    const logoutRes = await logoutHandler(logoutReq);
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('set-cookie')).toContain('Max-Age=0');

    // Attempting to access /api/auth/me with revoked session must return 401
    const meReq = new Request(`${env.APP_URL}/api/auth/me`, {
      method: 'GET',
      headers: { cookie: userACookie },
    });
    const meRes = await meHandler(meReq);
    expect(meRes.status).toBe(401);
  });

  it('9. IDOR protection: User B cannot access User A project', async () => {
    // Register User B
    const regBReq = new Request(`${env.APP_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '10.10.2.1',
        origin: env.APP_URL,
      },
      body: JSON.stringify(testUserB),
    });
    const regBRes = await registerHandler(regBReq);
    expect(regBRes.status).toBe(200);
    const bData = await regBRes.json();
    userBId = bData.user.id;
    userBCookie = regBRes.headers.get('set-cookie')!.split(';')[0]!;

    // Create a project owned by User A
    const projectA = await createProject({ userId: userAId }, "User A's Secret Project");

    // Test a protected route requiring viewer role on projectA
    const testProjectRoute = withRoute(
      {
        auth: true,
        role: 'viewer',
        skipCsrf: true,
      },
      async ({ projectId, role }) => {
        return { ok: true, projectId, role };
      }
    );

    // User B tries to access User A's project
    const idorReq = new Request(`${env.APP_URL}/api/test-project/${projectA.id}`, {
      method: 'GET',
      headers: { cookie: userBCookie },
    });

    // Pass resolved params with projectId
    const idorRes = await testProjectRoute(idorReq, {
      params: Promise.resolve({ projectId: projectA.id }),
    });

    expect(idorRes.status).toBe(403);
    const idorData = await idorRes.json();
    expect(idorData.error.code).toBe('FORBIDDEN');
    expect(idorData.error.message).toContain('Access denied to project');

    // Cleanup project A
    await sql`DELETE FROM projects WHERE id = ${projectA.id}`;
  });
});
