import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export const noopNodeConfigSchema = z.object({});
export type NoopNodeConfig = z.infer<typeof noopNodeConfigSchema>;

export const noopNode: NodeDefinition<NoopNodeConfig> = {
  type: 'logic.noop',
  version: 1,
  name: 'No-Op / Pass-Through',
  description: 'Passes all input items straight to output without modifying them.',
  category: 'LOGIC',
  icon: 'arrow-right',
  inputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  mode: 'batch',
  fields: [],
  configSchema: noopNodeConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {},
  },
  credentials: [],
  execute: async (
    _ctx: NodeContext,
    items: Item[],
    _config: NoopNodeConfig
  ): Promise<NodeResult> => {
    return { outputs: { main: items } };
  },
};
