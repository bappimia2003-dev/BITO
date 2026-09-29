import { describe, it, expect } from 'vitest';
import { manualTriggerNode } from './index.js';

describe('trigger.manual', () => {
  it('validates config with default schema', () => {
    const res = manualTriggerNode.configSchema.safeParse({});
    expect(res.success).toBe(true);
  });

  it('executes and returns input items if provided', async () => {
    const ctx = {} as never;
    const items = [{ json: { foo: 'bar' } }];
    const res = await manualTriggerNode.execute(ctx, items, {});
    expect(res.outputs.main).toEqual(items);
  });

  it('executes and returns samplePayload if no items provided', async () => {
    const ctx = {} as never;
    const res = await manualTriggerNode.execute(ctx, [], { samplePayload: { hello: 'world' } });
    expect(res.outputs.main).toEqual([{ json: { hello: 'world' } }]);
  });
});
