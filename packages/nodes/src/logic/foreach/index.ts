import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export const forEachNodeConfigSchema = z.object({
  batchSize: z.number().default(1),
  maxIterations: z.number().default(1000),
});

export type ForEachNodeConfig = z.infer<typeof forEachNodeConfigSchema>;

export const forEachNode: NodeDefinition<ForEachNodeConfig> = {
  type: 'logic.foreach',
  version: 1,
  name: 'Loop (ForEach)',
  description:
    'Iterates sequentially over a batch of items, emitting each item or batch on the loop branch.',
  category: 'LOGIC',
  icon: 'repeat',
  inputs: [
    { id: 'main', label: 'Main', kind: 'main' },
    { id: 'loop', label: 'Loop Back' },
  ],
  outputs: [
    { id: 'each', label: 'Each' },
    { id: 'done', label: 'Done' },
  ],
  mode: 'batch',
  stateful: true,
  fields: [
    {
      name: 'batchSize',
      label: 'Batch Size',
      type: 'number',
      default: 1,
      help: 'Number of items to emit per iteration.',
    },
    {
      name: 'maxIterations',
      label: 'Max Iterations',
      type: 'number',
      default: 1000,
      help: 'Safety ceiling to prevent infinite loops.',
    },
  ],
  configSchema: forEachNodeConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {},
  },
  credentials: [],
  execute: async (
    _ctx: NodeContext,
    items: Item[],
    _config: ForEachNodeConfig
  ): Promise<NodeResult> => {
    if (items.length === 0) {
      return { outputs: { done: [] } };
    }
    return {
      outputs: {
        each: items.slice(0, 1),
        done: items.length > 1 ? [] : items,
      },
    };
  },
};
