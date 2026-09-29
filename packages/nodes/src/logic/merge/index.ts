import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export const mergeNodeConfigSchema = z.object({
  mode: z.enum(['append', 'pairByIndex', 'mergeByKey', 'firstArrived']).default('append'),
  keyField: z.string().optional().default(''),
});

export type MergeNodeConfig = z.infer<typeof mergeNodeConfigSchema>;

export const mergeNode: NodeDefinition<MergeNodeConfig> = {
  type: 'logic.merge',
  version: 1,
  name: 'Merge',
  description: 'Synchronizes and joins multiple parallel workflow branches into a unified stream.',
  category: 'LOGIC',
  icon: 'git-merge',
  inputs: [
    { id: 'in_1', label: 'Input 1' },
    { id: 'in_2', label: 'Input 2' },
    { id: 'in_3', label: 'Input 3' },
    { id: 'in_4', label: 'Input 4' },
  ],
  outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  mode: 'batch',
  stateful: true,
  fields: [
    {
      name: 'mode',
      label: 'Merge Mode',
      type: 'select',
      default: 'append',
      options: [
        { label: 'Append (Concatenate when all arrived)', value: 'append' },
        { label: 'Pair By Index', value: 'pairByIndex' },
        { label: 'Merge By Key Field', value: 'mergeByKey' },
        { label: 'First Arrived (Proceed immediately)', value: 'firstArrived' },
      ],
    },
    {
      name: 'keyField',
      label: 'Key Field',
      type: 'string',
      default: '',
      showIf: { field: 'mode', equals: 'mergeByKey' },
    },
  ],
  configSchema: mergeNodeConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {},
  },
  credentials: [],
  execute: async (
    _ctx: NodeContext,
    items: Item[],
    _config: MergeNodeConfig
  ): Promise<NodeResult> => {
    return { outputs: { main: items } };
  },
};
