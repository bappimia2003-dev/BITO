import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export const manualTriggerConfigSchema = z.object({
  samplePayload: z.record(z.unknown()).optional(),
});

export type ManualTriggerConfig = z.infer<typeof manualTriggerConfigSchema>;

export const manualTriggerNode: NodeDefinition<ManualTriggerConfig> = {
  type: 'trigger.manual',
  version: 1,
  name: 'Manual Trigger',
  description: 'Starts a workflow manually with an optional payload for testing and ad-hoc runs.',
  category: 'TRIGGERS',
  icon: 'play',
  inputs: [],
  outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  mode: 'batch',
  fields: [
    {
      name: 'samplePayload',
      label: 'Sample Payload',
      help: 'JSON payload passed to the workflow during test runs.',
      type: 'json',
      default: {},
      required: false,
    },
  ],
  configSchema: manualTriggerConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {},
  },
  credentials: [],
  execute: async (
    _ctx: NodeContext,
    items: Item[],
    config: ManualTriggerConfig
  ): Promise<NodeResult> => {
    if (items.length > 0) {
      return { outputs: { main: items } };
    }
    const payload = config.samplePayload ?? {};
    return {
      outputs: {
        main: [{ json: payload as Record<string, import('@bito/shared').Json> }],
      },
    };
  },
};
