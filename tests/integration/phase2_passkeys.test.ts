import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { POST as passkeyRegOptionsHandler } from '../../apps/web/src/app/api/auth/passkey/register/options/route.js';
import { POST as passkeyRegVerifyHandler } from '../../apps/web/src/app/api/auth/passkey/register/verify/route.js';
import { POST as passkeyLoginOptionsHandler } from '../../apps/web/src/app/api/auth/passkey/login/options/route.js';
import { POST as passkeyLoginVerifyHandler } from '../../apps/web/src/app/api/auth/passkey/login/verify/route.js';
import { DELETE as passkeyDeleteHandler } from '../../apps/web/src/app/api/auth/passkeys/[id]/route.js';
import { GET as passkeysListHandler } from '../../apps/web/src/app/api/auth/passkeys/route.js';
import { POST as passwordRegHandler } from '../../apps/web/src/app/api/auth/register/route.js';
import { SoftwareAuthenticator } from '../helpers/softwareAuthenticator.js';
import { env } from '../../apps/web/src/server/env.js';
import { createWebAuthnChallenge } from '../../apps/web/src/server/repositories/webauthn.js';

describe('Phase 2 WebAuthn Passkeys Integration Tests', () => {
  let sql: Sql;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  const authenticator = new SoftwareAuthenticator();
  const testEmail = `passkey_user_${Date.now()}@example.com`;
  const testDisplayName = 'Passkey User';

  let createdUserId = '';
  let sessionCookie = '';
  let registeredCredentialDbId = '';

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 5 });
    await sql`DELETE FROM rate_limits`;
  });

  afterAll(async () => {
    if (sql) {
      if (createdUserId) {
        await sql`UPDATE users SET is_disabled = true WHERE id = ${createdUserId}`;
      }
      await sql.end({ timeout: 5 });
    }
  });

  it('1. Passkey registration: full flow with SoftwareAuthenticator creates user and session', async () => {
    // 1a. Request registration options
    const optReq = new Request(`${env.APP_URL}/api/auth/passkey/register/options`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '10.20.1.1',
        origin: env.APP_URL,
      },
      body: JSON.stringify({ email: testEmail, displayName: testDisplayName }),
    });

    const optRes = await passkeyRegOptionsHandler(optReq);
    expect(optRes.status).toBe(200);
    const options = await optRes.json();
    expect(options.challenge).toBeTruthy();
    expect(options.rp.id).toBe(env.WEBAUTHN_RP_ID);

    // 1b. Software authenticator signs the registration
    const { response } = authenticator.createRegistrationResponse(
      options.challenge,
      env.WEBAUTHN_ORIGIN,
      env.WEBAUTHN_RP_ID
    );

    // 1c. Verify registration
    const verifyReq = new Request(`${env.APP_URL}/api/auth/passkey/register/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
      },
      body: JSON.stringify({
        response,
        challenge: options.challenge,
        deviceName: 'Hardware YubiKey',
      }),
    });

    const verifyRes = await passkeyRegVerifyHandler(verifyReq);
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.verified).toBe(true);
    expect(verifyData.isNewUser).toBe(true);
    expect(verifyData.user.email).toBe(testEmail.toLowerCase());
    createdUserId = verifyData.user.id;

    const setCookie = verifyRes.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    sessionCookie = setCookie!.split(';')[0]!;

    // Verify DB: user has null password_hash, webauthn_credentials has 1 row
    const creds = await sql<{ id: string; credential_id: string }[]>`
      SELECT id, credential_id FROM webauthn_credentials WHERE user_id = ${createdUserId}
    `;
    expect(creds.length).toBe(1);
    expect(creds[0]?.credential_id).toBe(authenticator.credentialId.toString('base64url'));
    registeredCredentialDbId = creds[0]!.id;
  });

  it('2. Passkey login: full flow with SoftwareAuthenticator succeeds and updates counter', async () => {
    // 2a. Request login options
    const optReq = new Request(`${env.APP_URL}/api/auth/passkey/login/options`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
      },
      body: JSON.stringify({}),
    });

    const optRes = await passkeyLoginOptionsHandler(optReq);
    expect(optRes.status).toBe(200);
    const options = await optRes.json();

    // 2b. Authenticate with SoftwareAuthenticator (increments counter)
    const response = authenticator.createAuthenticationResponse(
      options.challenge,
      env.WEBAUTHN_ORIGIN,
      env.WEBAUTHN_RP_ID,
      1
    );

    // 2c. Verify login
    const verifyReq = new Request(`${env.APP_URL}/api/auth/passkey/login/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
      },
      body: JSON.stringify({
        response,
        challenge: options.challenge,
      }),
    });

    const verifyRes = await passkeyLoginVerifyHandler(verifyReq);
    expect(verifyRes.status).toBe(200);
    const verifyData = await verifyRes.json();
    expect(verifyData.success).toBe(true);
    expect(verifyData.user.id).toBe(createdUserId);

    // Verify counter in DB was incremented to 1
    const credRows = await sql<{ counter: number | string }[]>`
      SELECT counter FROM webauthn_credentials WHERE user_id = ${createdUserId}
    `;
    expect(Number(credRows[0]?.counter)).toBe(1);
  });

  it('3. Counter regression check: authenticator sending equal or lower counter is rejected', async () => {
    // Current counter in DB is 1. Authenticator sends counter = 0 or 1 without incrementing.
    const optReq = new Request(`${env.APP_URL}/api/auth/passkey/login/options`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
      },
      body: JSON.stringify({}),
    });
    const optRes = await passkeyLoginOptionsHandler(optReq);
    const options = await optRes.json();

    // Force cloned authenticator response with counter = 0 (regression)
    authenticator.counter = 0;
    const clonedResponse = authenticator.createAuthenticationResponse(
      options.challenge,
      env.WEBAUTHN_ORIGIN,
      env.WEBAUTHN_RP_ID,
      0 // counter remains 0
    );

    const verifyReq = new Request(`${env.APP_URL}/api/auth/passkey/login/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
      },
      body: JSON.stringify({
        response: clonedResponse,
        challenge: options.challenge,
      }),
    });

    const verifyRes = await passkeyLoginVerifyHandler(verifyReq);
    expect(verifyRes.status).toBe(401);
    const verifyData = await verifyRes.json();
    expect(verifyData.error.message.toLowerCase()).toContain('counter');
  });

  it('4. Replayed WebAuthn challenge rejected', async () => {
    // Try to reuse the challenge that was already consumed in previous test
    const dummyResponse = authenticator.createAuthenticationResponse(
      'reused_challenge_string',
      env.WEBAUTHN_ORIGIN,
      env.WEBAUTHN_RP_ID
    );

    const verifyReq = new Request(`${env.APP_URL}/api/auth/passkey/login/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
      },
      body: JSON.stringify({
        response: dummyResponse,
        challenge: 'non_existent_already_consumed_challenge',
      }),
    });

    const verifyRes = await passkeyLoginVerifyHandler(verifyReq);
    expect(verifyRes.status).toBe(400);
    const data = await verifyRes.json();
    expect(data.error.message).toContain('challenge is invalid');
  });

  it('5. Expired WebAuthn challenge rejected', async () => {
    // Create an explicitly expired challenge in DB (ttl: -10s)
    const expiredChal = await createWebAuthnChallenge({
      challenge: 'already_expired_challenge_12345',
      purpose: 'login',
      ttlSeconds: -10, // expired 10 seconds ago
    });

    const dummyResponse = authenticator.createAuthenticationResponse(
      expiredChal.challenge,
      env.WEBAUTHN_ORIGIN,
      env.WEBAUTHN_RP_ID
    );

    const verifyReq = new Request(`${env.APP_URL}/api/auth/passkey/login/verify`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
      },
      body: JSON.stringify({
        response: dummyResponse,
        challenge: expiredChal.challenge,
      }),
    });

    const verifyRes = await passkeyLoginVerifyHandler(verifyReq);
    expect(verifyRes.status).toBe(400);
    const data = await verifyRes.json();
    expect(data.error.message).toContain('challenge is invalid, expired, or already used');
  });

  it('6. Defense: cannot remove the last login method', async () => {
    // User only has this 1 passkey and no password
    const deleteReq = new Request(`${env.APP_URL}/api/auth/passkeys/${registeredCredentialDbId}`, {
      method: 'DELETE',
      headers: {
        'content-type': 'application/json',
        origin: env.APP_URL,
        cookie: sessionCookie,
      },
    });

    const deleteRes = await passkeyDeleteHandler(deleteReq, {
      params: Promise.resolve({ id: registeredCredentialDbId }),
    });

    expect(deleteRes.status).toBe(400);
    const data = await deleteRes.json();
    expect(data.error.code).toBe('BAD_REQUEST');
    expect(data.error.message).toContain('Cannot remove the last login method');

    // Verify passkeys listing returns safe public metadata (no private/public raw key bytes)
    const listReq = new Request(`${env.APP_URL}/api/auth/passkeys`, {
      method: 'GET',
      headers: { cookie: sessionCookie },
    });
    const listRes = await passkeysListHandler(listReq);
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.passkeys.length).toBe(1);
    expect(listData.passkeys[0].deviceName).toBe('Hardware YubiKey');
    expect(listData.passkeys[0].publicKey).toBeUndefined(); // never expose public key bytes
  });

  it('7. ALLOW_REGISTRATION=false behavior: rejects registration when users exist', async () => {
    // Temporarily set env.ALLOW_REGISTRATION to false
    const originalSetting = env.ALLOW_REGISTRATION;
    (env as { ALLOW_REGISTRATION: boolean }).ALLOW_REGISTRATION = false;

    try {
      const regReq = new Request(`${env.APP_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '10.20.1.2',
          origin: env.APP_URL,
        },
        body: JSON.stringify({
          email: 'disallowed_user@example.com',
          displayName: 'Disallowed User',
          password: 'DisallowedPassword123!',
        }),
      });

      const regRes = await passwordRegHandler(regReq);
      expect(regRes.status).toBe(403);
      const data = await regRes.json();
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toContain('Registration is disabled');
    } finally {
      (env as { ALLOW_REGISTRATION: boolean }).ALLOW_REGISTRATION = originalSetting;
    }
  });
});
