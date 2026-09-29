import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
} from '@simplewebauthn/server';
import { BitoError } from '@bito/shared';
import { env } from '../env.js';
import {
  createWebAuthnChallenge,
  consumeWebAuthnChallenge,
  findCredentialByCredentialId,
  listCredentialsForUser,
  updateCredentialCounter,
} from '../repositories/webauthn.js';
import { findUserById, type User } from '../repositories/users.js';
import { createSession, type Session } from '../repositories/sessions.js';
import { recordAuditLog } from '../repositories/audit.js';

export async function createPasskeyLoginOptions() {
  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    userVerification: 'preferred',
  });

  await createWebAuthnChallenge({
    challenge: options.challenge,
    purpose: 'login',
    ttlSeconds: 300,
  });

  return options;
}

export async function verifyPasskeyLogin(params: {
  response: AuthenticationResponseJSON;
  challenge: string;
  ip?: string;
  userAgent?: string;
}): Promise<{ user: User; session: Session; rawToken: string }> {
  const challengeRow = await consumeWebAuthnChallenge(params.challenge, 'login');

  const credential = await findCredentialByCredentialId(params.response.id);
  if (!credential) {
    throw BitoError('UNAUTHORIZED', 'Passkey credential not recognized', { httpStatus: 401 });
  }

  const user = await findUserById(credential.userId);
  if (!user || user.isDisabled) {
    throw BitoError('UNAUTHORIZED', 'Account is invalid or disabled', { httpStatus: 401 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: params.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransport[],
      },
      requireUserVerification: false,
    });
  } catch (err) {
    throw BitoError(
      'UNAUTHORIZED',
      `Passkey authentication failed: ${err instanceof Error ? err.message : String(err)}`,
      { httpStatus: 401 }
    );
  }

  if (!verification.verified || !verification.authenticationInfo) {
    throw BitoError('UNAUTHORIZED', 'Passkey authentication failed', { httpStatus: 401 });
  }

  const { newCounter } = verification.authenticationInfo;

  if (credential.counter > 0 && newCounter < credential.counter) {
    throw BitoError('UNAUTHORIZED', 'Authenticator counter regression detected', {
      httpStatus: 401,
    });
  }

  await updateCredentialCounter(credential.credentialId, newCounter);

  const { session, rawToken } = await createSession({
    userId: user.id,
    ip: params.ip,
    userAgent: params.userAgent,
  });

  await recordAuditLog({
    userId: user.id,
    action: 'auth.login',
    targetType: 'session',
    targetId: session.id,
    ip: params.ip,
    userAgent: params.userAgent,
    meta: { method: 'passkey', credentialId: credential.credentialId },
  });

  return { user, session, rawToken };
}

export async function createPasskeyReauthOptions(userId: string) {
  const credentials = await listCredentialsForUser(userId);
  if (credentials.length === 0) {
    throw BitoError('BAD_REQUEST', 'No passkeys registered for this account', {
      httpStatus: 400,
    });
  }

  const options = await generateAuthenticationOptions({
    rpID: env.WEBAUTHN_RP_ID,
    userVerification: 'preferred',
    allowCredentials: credentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransport[],
    })),
  });

  await createWebAuthnChallenge({
    challenge: options.challenge,
    purpose: 'reauth',
    userId,
    ttlSeconds: 300,
  });

  return options;
}

export async function verifyPasskeyReauth(params: {
  userId: string;
  sessionId: string;
  response: AuthenticationResponseJSON;
  challenge: string;
  ip?: string;
  userAgent?: string;
}): Promise<void> {
  const challengeRow = await consumeWebAuthnChallenge(params.challenge, 'reauth');

  if (challengeRow.userId !== params.userId) {
    throw BitoError('UNAUTHORIZED', 'Challenge does not match current user', {
      httpStatus: 401,
    });
  }

  const credential = await findCredentialByCredentialId(params.response.id);
  if (!credential || credential.userId !== params.userId) {
    throw BitoError('UNAUTHORIZED', 'Passkey does not belong to current user', {
      httpStatus: 401,
    });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: params.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      credential: {
        id: credential.credentialId,
        publicKey: new Uint8Array(credential.publicKey),
        counter: Number(credential.counter),
        transports: credential.transports as AuthenticatorTransport[],
      },
      requireUserVerification: false,
    });
  } catch (err) {
    throw BitoError(
      'UNAUTHORIZED',
      `Passkey re-authentication failed: ${err instanceof Error ? err.message : String(err)}`,
      { httpStatus: 401 }
    );
  }

  if (!verification.verified || !verification.authenticationInfo) {
    throw BitoError('UNAUTHORIZED', 'Passkey re-authentication failed', {
      httpStatus: 401,
    });
  }

  const { newCounter } = verification.authenticationInfo;
  if (credential.counter > 0 && newCounter < credential.counter) {
    throw BitoError('UNAUTHORIZED', 'Authenticator counter regression detected', {
      httpStatus: 401,
    });
  }

  await updateCredentialCounter(credential.credentialId, newCounter);

  await recordAuditLog({
    userId: params.userId,
    action: 'auth.reauth',
    targetType: 'session',
    targetId: params.sessionId,
    ip: params.ip,
    userAgent: params.userAgent,
    meta: { method: 'passkey', credentialId: credential.credentialId },
  });
}
