import { describe, it, expect } from 'vitest';
import { setNode } from './index.js';

describe('data.set', () => {
  it('applies assignments to items', async () => {
    const items = [{ json: { existing: 'yes' } }];
    const res = await setNode.execute({} as never, items, {
      assignments: [
        { name: 'name', value: 'John', type: 'string' },
        { name: 'age', value: '30', type: 'number' },
      ],
      keepOnlySet: false,
      target: 'item',
    });

    expect(res.outputs.main).toEqual([
      {
        json: {
          existing: 'yes',
          name: 'John',
          age: 30,
        },
      },
    ]);
  });

  it('respects keepOnlySet flag', async () => {
    const items = [{ json: { existing: 'yes' } }];
    const res = await setNode.execute({} as never, items, {
      assignments: [{ name: 'name', value: 'John', type: 'string' }],
      keepOnlySet: true,
      target: 'item',
    });

    expect(res.outputs.main).toEqual([
      {
        json: {
          name: 'John',
        },
      },
    ]);
  });
});
