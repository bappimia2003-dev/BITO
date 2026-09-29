import { describe, it, expect } from 'vitest';
import { redact } from '../src/redact.js';

describe('redact helper', () => {
  it('redacts sensitive keys in objects', () => {
    const data = {
      user: 'alice',
      password: 'super-secret-password',
      bot_token: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11',
      apiKey: 'gm-secret-key-999',
      nested: {
        authorization: 'Bearer secret_token',
        cookie: 'session=12345',
        publicField: 'safe value',
      },
    };

    const redacted = redact(data) as typeof data;
    expect(redacted.user).toBe('alice');
    expect(redacted.password).toBe('***');
    expect(redacted.bot_token).toBe('***');
    expect(redacted.apiKey).toBe('***');
    expect(redacted.nested.authorization).toBe('***');
    expect(redacted.nested.cookie).toBe('***');
    expect(redacted.nested.publicField).toBe('safe value');
  });

  it('redacts known decrypted secrets from strings', () => {
    const secret = 'my-super-secret-telegram-token';
    const text = `Attempting to call https://api.telegram.org/bot${secret}/sendMessage`;
    const redacted = redact(text, [secret]);
    expect(redacted).toBe('Attempting to call https://api.telegram.org/bot***/sendMessage');
  });

  it('handles circular references and arrays safely', () => {
    const circularObj: Record<string, unknown> = { name: 'loop' };
    circularObj.self = circularObj;

    const arr = [circularObj, { api_key: 'hidden' }, 'clean string'];
    const redacted = redact(arr) as unknown[];

    expect(Array.isArray(redacted)).toBe(true);
    expect((redacted[0] as Record<string, unknown>).self).toBe('[Circular]');
    expect((redacted[1] as Record<string, unknown>).api_key).toBe('***');
    expect(redacted[2]).toBe('clean string');
  });
});
