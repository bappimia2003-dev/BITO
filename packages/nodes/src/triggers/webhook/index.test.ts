import { describe, it, expect } from 'vitest';
import { webhookTriggerNode } from './index.js';

describe('trigger.webhook', () => {
  it('validates config defaults', () => {
    const res = webhookTriggerNode.configSchema.safeParse({});
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.methods).toEqual(['POST']);
      expect(res.data.requireSignature).toBe(true);
    }
  });

  it('passes input items to main output', async () => {
    const items = [{ json: { method: 'POST', body: { a: 1 } } }];
    const res = await webhookTriggerNode.execute({} as never, items, {
      path: 'test',
      methods: ['POST'],
      requireSignature: true,
    });
    expect(res.outputs.main).toEqual(items);
  });
});
