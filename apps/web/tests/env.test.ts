import { describe, it, expect } from 'vitest';
import { validateEnv } from '../src/server/env.js';

describe('Environment Validator', () => {
  const validKey = Buffer.alloc(32, 1).toString('base64');

  it('validates a correct environment', () => {
    const valid = {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/bito',
      APP_URL: 'http://localhost:3000',
      CREDENTIAL_ENCRYPTION_KEY: validKey,
      CRON_SECRET: 'super_secret_cron_secret_long_enough',
      WEBAUTHN_RP_ID: 'localhost',
      WEBAUTHN_RP_NAME: 'BITO',
      WEBAUTHN_ORIGIN: 'http://localhost:3000',
      NEXT_PUBLIC_APP_NAME: 'BITO',
    };

    const result = validateEnv(valid);
    expect(result.APP_URL).toBe('http://localhost:3000');
    expect(result.NEXT_PUBLIC_APP_NAME).toBe('BITO');
  });

  it('rejects disallowed NEXT_PUBLIC_* variables', () => {
    const invalid = {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/bito',
      APP_URL: 'http://localhost:3000',
      CREDENTIAL_ENCRYPTION_KEY: validKey,
      CRON_SECRET: 'super_secret_cron_secret_long_enough',
      WEBAUTHN_RP_ID: 'localhost',
      WEBAUTHN_RP_NAME: 'BITO',
      WEBAUTHN_ORIGIN: 'http://localhost:3000',
      NEXT_PUBLIC_APP_NAME: 'BITO',
      NEXT_PUBLIC_SECRET_LEAK: 'forbidden',
    };

    expect(() => validateEnv(invalid)).toThrowError(
      /Disallowed public environment variables detected/
    );
  });

  it('rejects encryption key with invalid byte length', () => {
    const invalidKey = Buffer.alloc(16, 1).toString('base64'); // Only 16 bytes
    const invalid = {
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/bito',
      APP_URL: 'http://localhost:3000',
      CREDENTIAL_ENCRYPTION_KEY: invalidKey,
      CRON_SECRET: 'super_secret_cron_secret_long_enough',
      WEBAUTHN_RP_ID: 'localhost',
      WEBAUTHN_RP_NAME: 'BITO',
      WEBAUTHN_ORIGIN: 'http://localhost:3000',
    };

    expect(() => validateEnv(invalid)).toThrowError(
      /CREDENTIAL_ENCRYPTION_KEY must be base64-encoded 32 bytes/
    );
  });
});
