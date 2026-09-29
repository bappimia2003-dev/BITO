import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { BitoError } from '@bito/shared';
import { validateEnv } from '../env.js';

export interface EncryptedData {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  keyVersion: number;
}

export interface EncryptedInput {
  ciphertext: Buffer | Uint8Array;
  iv: Buffer | Uint8Array;
  authTag: Buffer | Uint8Array;
  keyVersion: number;
}

/**
 * Resolves the 32-byte AES-256 key buffer for a given key version.
 */
export function getKeyForVersion(version: number): Buffer {
  const env = validateEnv();
  let base64Key: string | undefined;

  if (version === 1) {
    base64Key = env.CREDENTIAL_ENCRYPTION_KEY;
  } else if (version === 2) {
    base64Key = env.CREDENTIAL_ENCRYPTION_KEY_V2;
  } else {
    throw BitoError('CONFIG_INVALID', `Unsupported encryption key version: ${version}`);
  }

  if (!base64Key) {
    throw BitoError(
      'CONFIG_INVALID',
      `Encryption key for version ${version} is not configured in environment`
    );
  }

  const keyBuf = Buffer.from(base64Key, 'base64');
  if (keyBuf.length !== 32) {
    throw BitoError(
      'CONFIG_INVALID',
      `Encryption key for version ${version} must be exactly 32 bytes (got ${keyBuf.length})`
    );
  }

  return keyBuf;
}

/**
 * Encrypts a plaintext string with AES-256-GCM using a random 12-byte IV
 * and binding the ciphertext to the credentialId via Additional Authenticated Data (AAD).
 */
export function encryptCredential(
  plaintext: string,
  credentialId: string,
  keyVersion: number = 1
): EncryptedData {
  if (!credentialId) {
    throw BitoError('CONFIG_INVALID', 'credentialId is required for AAD binding');
  }

  const key = getKeyForVersion(keyVersion);
  const iv = randomBytes(12);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(credentialId, 'utf8'));

  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv,
    authTag,
    keyVersion,
  };
}

/**
 * Decrypts an encrypted payload with AES-256-GCM, verifying authentication tag
 * and AAD bound to the credentialId.
 */
export function decryptCredential(encrypted: EncryptedInput, credentialId: string): string {
  if (!credentialId) {
    throw BitoError('CONFIG_INVALID', 'credentialId is required for AAD binding');
  }

  const key = getKeyForVersion(encrypted.keyVersion);
  const iv = Buffer.from(encrypted.iv);
  const authTag = Buffer.from(encrypted.authTag);
  const ciphertext = Buffer.from(encrypted.ciphertext);

  if (iv.length !== 12) {
    throw BitoError('CREDENTIAL_INVALID', `Invalid IV length: expected 12 bytes, got ${iv.length}`);
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(credentialId, 'utf8'));
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (error) {
    throw BitoError(
      'CREDENTIAL_INVALID',
      'Failed to decrypt credential payload: authentication tag mismatch or corrupted ciphertext',
      { cause: error }
    );
  }
}

/**
 * Convenience helper to encrypt a JSON-serializable secret object.
 */
export function encryptJson<T>(
  data: T,
  credentialId: string,
  keyVersion: number = 1
): EncryptedData {
  return encryptCredential(JSON.stringify(data), credentialId, keyVersion);
}

/**
 * Convenience helper to decrypt a JSON secret object.
 */
export function decryptJson<T>(encrypted: EncryptedInput, credentialId: string): T {
  const plaintext = decryptCredential(encrypted, credentialId);
  try {
    return JSON.parse(plaintext) as T;
  } catch (error) {
    throw BitoError('CREDENTIAL_INVALID', 'Failed to parse decrypted credential JSON payload', {
      cause: error,
    });
  }
}
