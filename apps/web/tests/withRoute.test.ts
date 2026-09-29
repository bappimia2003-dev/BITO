import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { withRoute } from '../src/server/http/withRoute.js';
import { BitoError } from '@bito/shared';

describe('withRoute wrapper', () => {
  it('parses valid body and returns 200 JSON response', async () => {
    const handler = withRoute(
      {
        body: z.object({ name: z.string().min(2) }),
        skipCsrf: true,
      },
      async ({ body }) => {
        return { greeting: `Hello, ${body.name}` };
      }
    );

    const req = new Request('http://localhost:3000/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Alice' }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { greeting: string };
    expect(json.greeting).toBe('Hello, Alice');
  });

  it('maps BitoError to standard error envelope with correct httpStatus', async () => {
    const handler = withRoute({ skipCsrf: true }, async () => {
      throw BitoError('NOT_FOUND', 'Entity not found', {
        httpStatus: 404,
        details: { id: '123' },
      });
    });

    const req = new Request('http://localhost:3000/api/test', { method: 'GET' });
    const res = await handler(req);
    expect(res.status).toBe(404);

    const json = (await res.json()) as {
      error: { code: string; message: string; details: unknown };
    };
    expect(json.error.code).toBe('NOT_FOUND');
    expect(json.error.message).toBe('Entity not found');
    expect(json.error.details).toEqual({ id: '123' });
  });

  it('rejects cross-origin mutating requests when CSRF check is enabled', async () => {
    const handler = withRoute({ skipCsrf: false }, async () => ({ ok: true }));

    const req = new Request('http://localhost:3000/api/test', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://malicious-site.com',
      },
      body: JSON.stringify({}),
    });

    const res = await handler(req);
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string; message: string } };
    expect(json.error.code).toBe('FORBIDDEN');
    expect(json.error.message).toContain('Cross-origin request rejected');
  });
});
