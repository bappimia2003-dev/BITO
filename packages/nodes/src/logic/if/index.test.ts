import { describe, it, expect } from 'vitest';
import { ifNode } from './index.js';

describe('logic.if', () => {
  it('routes items to true port when condition matches', async () => {
    const items = [{ json: { age: 25 } }];
    const res = await ifNode.execute({} as never, items, {
      conditions: [{ left: '25', operator: 'equals', right: '25' }],
      combinator: 'AND',
    });
    expect(res.outputs.true).toHaveLength(1);
    expect(res.outputs.false).toHaveLength(0);
  });

  it('routes items to false port when condition fails', async () => {
    const items = [{ json: { age: 15 } }];
    const res = await ifNode.execute({} as never, items, {
      conditions: [{ left: '15', operator: 'gt', right: '18' }],
      combinator: 'AND',
    });
    expect(res.outputs.true).toHaveLength(0);
    expect(res.outputs.false).toHaveLength(1);
  });
});
