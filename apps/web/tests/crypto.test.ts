import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  encryptCredential,
  decryptCredential,
  encryptJson,
  decryptJson,
} from '../src/server/security/crypto.js';
import { BitoErrorClass } from '@bito/shared';

describe('AES-256-GCM Credential Crypto (SPEC 13.2)', () => {
  const originalEnv = { ...process.env };
  const testKeyV1 = Buffer.alloc(32, 0x11).toString('base64');
  const testKeyV2 = Buffer.alloc(32, 0x22).toString('base64');

  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = testKeyV1;
    process.env.CREDENTIAL_ENCRYPTION_KEY_V2 = testKeyV2;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('performs round-trip encryption and decryption', () => {
    const credId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const secret = 'super-secret-api-token-12345';

    const encrypted = encryptCredential(secret, credId, 1);
    expect(encrypted.keyVersion).toBe(1);
    expect(encrypted.iv.length).toBe(12);
    expect(encrypted.authTag.length).toBe(16);
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);

    const decrypted = decryptCredential(encrypted, credId);
    expect(decrypted).toBe(secret);
  });

  it('generates unique IVs and ciphertexts for the same plaintext', () => {
    const credId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const secret = 'identical-plaintext';

    const enc1 = encryptCredential(secret, credId);
    const enc2 = encryptCredential(secret, credId);

    expect(enc1.iv.equals(enc2.iv)).toBe(false);
    expect(enc1.ciphertext.equals(enc2.ciphertext)).toBe(false);

    expect(decryptCredential(enc1, credId)).toBe(secret);
    expect(decryptCredential(enc2, credId)).toBe(secret);
  });

  it('detects tampering with ciphertext (flip a byte -> error)', () => {
    const credId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const secret = 'bot_token_secret_value';

    const encrypted = encryptCredential(secret, credId);
    // Tamper with the first byte of ciphertext
    const tamperedCiphertext = Buffer.from(encrypted.ciphertext);
    tamperedCiphertext[0] = (tamperedCiphertext[0] ?? 0) ^ 0xff;

    expect(() => {
      decryptCredential(
        {
          ...encrypted,
          ciphertext: tamperedCiphertext,
        },
        credId
      );
    }).toThrow(BitoErrorClass);
  });

  it('detects tampering with auth_tag', () => {
    const credId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const secret = 'bot_token_secret_value';

    const encrypted = encryptCredential(secret, credId);
    const tamperedTag = Buffer.from(encrypted.authTag);
    tamperedTag[0] = (tamperedTag[0] ?? 0) ^ 0xff;

    expect(() => {
      decryptCredential(
        {
          ...encrypted,
          authTag: tamperedTag,
        },
        credId
      );
    }).toThrow(BitoErrorClass);
  });

  it('prevents moving ciphertext between rows (wrong AAD / credentialId -> error)', () => {
    const credIdA = '11111111-1111-1111-1111-111111111111';
    const credIdB = '22222222-2222-2222-2222-222222222222';
    const secret = 'meta-page-access-token';

    const encA = encryptCredential(secret, credIdA);

    expect(() => {
      decryptCredential(encA, credIdB);
    }).toThrow(BitoErrorClass);
  });

  it('supports key rotation via key_version (v1 vs v2)', () => {
    const credId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const payload = { token: 'rotated-token', role: 'admin' };

    // Encrypt with v1
    const encV1 = encryptJson(payload, credId, 1);
    expect(encV1.keyVersion).toBe(1);
    const decV1 = decryptJson<typeof payload>(encV1, credId);
    expect(decV1).toEqual(payload);

    // Encrypt with v2
    const encV2 = encryptJson(payload, credId, 2);
    expect(encV2.keyVersion).toBe(2);
    const decV2 = decryptJson<typeof payload>(encV2, credId);
    expect(decV2).toEqual(payload);

    // Attempting to decrypt v2 ciphertext as v1 throws
    expect(() => {
      decryptJson({ ...encV2, keyVersion: 1 }, credId);
    }).toThrow(BitoErrorClass);
  });

  it('rejects unsupported key versions', () => {
    const credId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    expect(() => {
      encryptCredential('secret', credId, 3);
    }).toThrow(BitoErrorClass);
  });
});
