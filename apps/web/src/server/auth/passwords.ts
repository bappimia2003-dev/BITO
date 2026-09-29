import { hash, verify } from '@node-rs/argon2';
import { BitoError } from '@bito/shared';
import { isCommonPassword } from './commonPasswords.js';

// OWASP recommended Argon2id parameters
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

// Pre-computed dummy argon2id hash for timing equalization on unknown emails
// Generated with: hash('dummy_timing_equalization_secret', ARGON2_OPTIONS)
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$o5eUEb0d5TsY18oDmkNKWg$OOFx0vwfe/W3YBuROUlbLZxdbfYR8pX+Qgst7biZftM';

export function validatePasswordStrength(password: string): void {
  if (typeof password !== 'string') {
    throw BitoError('VALIDATION_FAILED', 'Password must be a string', { httpStatus: 400 });
  }

  if (password.length < 10) {
    throw BitoError('VALIDATION_FAILED', 'Password must be at least 10 characters long', {
      httpStatus: 400,
    });
  }

  if (password.length > 1024) {
    throw BitoError('VALIDATION_FAILED', 'Password exceeds maximum length', { httpStatus: 400 });
  }

  if (isCommonPassword(password)) {
    throw BitoError(
      'VALIDATION_FAILED',
      'This password is too common or easily guessable. Please choose a stronger password.',
      { httpStatus: 400 }
    );
  }
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

export async function verifyPassword(hashString: string, password: string): Promise<boolean> {
  try {
    return await verify(hashString, password);
  } catch {
    return false;
  }
}

/**
 * Executes a real Argon2id verification with a dummy hash to equalize timing
 * when an unknown email is supplied, preventing username enumeration.
 */
export async function dummyVerifyPassword(password: string): Promise<boolean> {
  try {
    await verify(DUMMY_HASH, password);
  } catch {
    // ignore
  }
  return false;
}
