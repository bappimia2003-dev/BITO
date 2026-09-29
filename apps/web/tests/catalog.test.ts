import { describe, it, expect, vi } from 'vitest';
import { GET as getCatalogHandler } from '../src/app/api/nodes/catalog/route.js';

// Mock authentication
vi.mock('../src/server/auth/cookies.js', () => ({
  extractSessionToken: vi.fn().mockReturnValue('mock-session-token'),
}));

vi.mock('../src/server/repositories/sessions.js', () => ({
  findActiveSessionByToken: vi.fn().mockResolvedValue({
    id: 'sess_1',
    userId: 'user_1',
    tokenHash: 'mock-hash',
    lastAuthAt: new Date(),
    expiresAt: new Date(Date.now() + 3600000),
  }),
}));

vi.mock('../src/server/repositories/users.js', () => ({
  findUserById: vi.fn().mockResolvedValue({
    id: 'user_1',
    email: 'test@example.com',
    displayName: 'Test User',
    isDisabled: false,
  }),
}));

describe('GET /api/nodes/catalog', () => {
  it('returns 200 with complete serializable node catalog for authenticated user', async () => {
    const req = new Request('http://localhost:3000/api/nodes/catalog', {
      headers: {
        origin: 'http://localhost:3000',
        cookie: 'bito_session=mock-session-token',
      },
    });

    const res = await getCatalogHandler(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.nodes).toBeDefined();
    expect(Array.isArray(data.nodes)).toBe(true);
    expect(data.nodes.length).toBeGreaterThanOrEqual(11);

    const manualNode = data.nodes.find((n: { type: string }) => n.type === 'trigger.manual');
    expect(manualNode).toBeDefined();
    expect(manualNode.name).toBe('Manual Trigger');
    expect(manualNode.category).toBe('TRIGGERS');

    const httpNode = data.nodes.find((n: { type: string }) => n.type === 'api.http');
    expect(httpNode).toBeDefined();
    expect(httpNode.category).toBe('API');

    // Snapshot security check: verify no functions or secrets
    for (const node of data.nodes) {
      expect(node.execute).toBeUndefined();
      expect(node.validate).toBeUndefined();
      expect(node.configSchema).toBeUndefined();
    }
  });
});
