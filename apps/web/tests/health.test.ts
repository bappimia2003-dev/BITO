import { describe, it, expect } from 'vitest';
import { GET } from '../src/app/api/health/route.js';

describe('Health API Route', () => {
  it('returns ok: true and db status', async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const json = (await res.json()) as { ok: boolean; db: boolean; version: string };
    expect(json.ok).toBe(true);
    expect(typeof json.db).toBe('boolean');
    expect(json.version).toBeDefined();
  });
});
