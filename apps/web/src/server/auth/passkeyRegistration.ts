import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  type RegistrationResponseJSON,
  type AuthenticatorTransport,
} from '@simplewebauthn/server';
import { BitoError } from '@bito/shared';
import { env } from '../env.js';
import {
  createWebAuthnChallenge,
  consumeWebAuthnChallenge,
  createCredential,
  listCredentialsForUser,
} from '../repositories/webauthn.js';
import {
  createUser,
  findUserByEmail,
  findUserById,
  countUsers,
  type User,
} from '../repositories/users.js';
import { createSession, type Session } from '../repositories/sessions.js';
import { recordAuditLog } from '../repositories/audit.js';

export async function createPasskeyRegistrationOptions(params: {
  user?: { id: string; email: string; displayName: string } | null;
  pendingEmail?: string;
  pendingDisplayName?: string;
}) {
  const { user, pendingEmail, pendingDisplayName } = params;

  if (!user) {
    if (!pendingEmail || !pendingDisplayName) {
      throw BitoError('VALIDATION_FAILED', 'Email and displayName are required for registration', {
        httpStatus: 400,
      });
    }

    if (!env.ALLOW_REGISTRATION) {
      const userCount = await countUsers();
      if (userCount > 0) {
        throw BitoError('FORBIDDEN', 'Registration is disabled', { httpStatus: 403 });
      }
    }

    const existingUser = await findUserByEmail(pendingEmail);
    if (existingUser) {
      throw BitoError('CONFLICT', 'A user with this email already exists', { httpStatus: 409 });
    }
  }

  const existingCredentials = user ? await listCredentialsForUser(user.id) : [];

  const options = await generateRegistrationOptions({
    rpName: env.WEBAUTHN_RP_NAME,
    rpID: env.WEBAUTHN_RP_ID,
    userID: new Uint8Array(Buffer.from(user ? user.id : pendingEmail!)),
    userName: user ? user.email : pendingEmail!,
    userDisplayName: user ? user.displayName : pendingDisplayName!,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.credentialId,
      transports: c.transports as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });

  await createWebAuthnChallenge({
    challenge: options.challenge,
    purpose: 'register',
    userId: user?.id ?? null,
    pendingEmail: user ? null : pendingEmail,
    pendingDisplayName: user ? null : pendingDisplayName,
    ttlSeconds: 300,
  });

  return options;
}

export async function verifyPasskeyRegistration(params: {
  response: RegistrationResponseJSON;
  challenge: string;
  deviceName?: string;
  ip?: string;
  userAgent?: string;
}): Promise<{
  user: User;
  session?: Session;
  rawToken?: string;
  isNewUser: boolean;
}> {
  const challengeRow = await consumeWebAuthnChallenge(params.challenge, 'register');

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: params.response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      requireUserVerification: false,
    });
  } catch (err) {
    throw BitoError(
      'VALIDATION_FAILED',
      `Passkey registration verification failed: ${err instanceof Error ? err.message : String(err)}`,
      { httpStatus: 400 }
    );
  }

  if (!verification.verified || !verification.registrationInfo) {
    throw BitoError('VALIDATION_FAILED', 'Passkey registration could not be verified', {
      httpStatus: 400,
    });
  }

  const { credential } = verification.registrationInfo;
  const credentialID = credential.id;
  const credentialPublicKey = credential.publicKey;
  const counter = credential.counter;
  const transports: string[] = params.response.response.transports ?? [];

  if (challengeRow.pendingEmail && challengeRow.pendingDisplayName) {
    if (!env.ALLOW_REGISTRATION) {
      const userCount = await countUsers();
      if (userCount > 0) {
        throw BitoError('FORBIDDEN', 'Registration is disabled', { httpStatus: 403 });
      }
    }

    const newUser = await createUser({
      email: challengeRow.pendingEmail,
      displayName: challengeRow.pendingDisplayName,
      passwordHash: null,
    });

    await createCredential({
      userId: newUser.id,
      credentialId: credentialID,
      publicKey: credentialPublicKey,
      counter,
      transports,
      deviceName: params.deviceName ?? 'Passkey',
    });

    const { session, rawToken } = await createSession({
      userId: newUser.id,
      ip: params.ip,
      userAgent: params.userAgent,
    });

    await recordAuditLog({
      userId: newUser.id,
      action: 'auth.register',
      targetType: 'user',
      targetId: newUser.id,
      ip: params.ip,
      userAgent: params.userAgent,
      meta: { method: 'passkey' },
    });

    await recordAuditLog({
      userId: newUser.id,
      action: 'passkey.create',
      targetType: 'webauthn_credential',
      targetId: credentialID,
      ip: params.ip,
      userAgent: params.userAgent,
      meta: { deviceName: params.deviceName ?? 'Passkey' },
    });

    return { user: newUser, session, rawToken, isNewUser: true };
  }

  if (challengeRow.userId) {
    const user = await findUserById(challengeRow.userId);
    if (!user || user.isDisabled) {
      throw BitoError('UNAUTHORIZED', 'User not found or disabled', { httpStatus: 401 });
    }

    await createCredential({
      userId: user.id,
      credentialId: credentialID,
      publicKey: credentialPublicKey,
      counter,
      transports,
      deviceName: params.deviceName ?? 'Passkey',
    });

    await recordAuditLog({
      userId: user.id,
      action: 'passkey.create',
      targetType: 'webauthn_credential',
      targetId: credentialID,
      ip: params.ip,
      userAgent: params.userAgent,
      meta: { deviceName: params.deviceName ?? 'Passkey' },
    });

    return { user, isNewUser: false };
  }

  throw BitoError('VALIDATION_FAILED', 'Invalid challenge state for registration', {
    httpStatus: 400,
  });
}
