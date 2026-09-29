import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export const setNodeConfigSchema = z.object({
  assignments: z
    .array(
      z.object({
        name: z.string(),
        value: z.unknown(),
        type: z.enum(['string', 'number', 'boolean', 'json']).default('string'),
      })
    )
    .default([]),
  keepOnlySet: z.boolean().default(false),
  target: z.enum(['item', 'executionVar']).default('item'),
});

export type SetNodeConfig = z.infer<typeof setNodeConfigSchema>;

export const setNode: NodeDefinition<SetNodeConfig> = {
  type: 'data.set',
  version: 1,
  name: 'Set / Transform',
  description: 'Sets or modifies item fields and execution variables using expressions.',
  category: 'DATA',
  icon: 'pen-tool',
  inputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  mode: 'perItem',
  fields: [
    {
      name: 'assignments',
      label: 'Assignments',
      type: 'keyValue',
      default: [],
      help: 'List of fields to assign.',
    },
    {
      name: 'keepOnlySet',
      label: 'Keep Only Set Fields',
      type: 'boolean',
      default: false,
      help: 'If true, discards existing input fields and keeps only the new assignments.',
    },
    {
      name: 'target',
      label: 'Target Destination',
      type: 'select',
      default: 'item',
      options: [
        { label: 'Item JSON', value: 'item' },
        { label: 'Execution Variable', value: 'executionVar' },
      ],
    },
  ],
  configSchema: setNodeConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {},
  },
  credentials: [],
  execute: async (_ctx: NodeContext, items: Item[], config: SetNodeConfig): Promise<NodeResult> => {
    const results: Item[] = [];

    for (const item of items) {
      const baseJson = config.keepOnlySet ? {} : { ...item.json };

      for (const assign of config.assignments) {
        let parsedVal: unknown = assign.value;
        if (assign.type === 'number') {
          parsedVal = Number(assign.value);
        } else if (assign.type === 'boolean') {
          parsedVal = assign.value === 'true' || assign.value === true;
        } else if (assign.type === 'json' && typeof assign.value === 'string') {
          try {
            parsedVal = JSON.parse(assign.value);
          } catch {
            parsedVal = assign.value;
          }
        }
        baseJson[assign.name] = parsedVal as import('@bito/shared').Json;
      }

      results.push({ json: baseJson, file: item.file });
    }

    return { outputs: { main: results } };
  },
};
