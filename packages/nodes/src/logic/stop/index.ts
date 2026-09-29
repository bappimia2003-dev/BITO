import { z } from 'zod';
import {
  BitoError,
  type NodeDefinition,
  type NodeContext,
  type Item,
  type NodeResult,
} from '@bito/shared';

export const stopNodeConfigSchema = z.object({
  message: z.string().default('Execution stopped by user logic'),
  errorCode: z.string().default('STOPPED_BY_USER_LOGIC'),
});

export type StopNodeConfig = z.infer<typeof stopNodeConfigSchema>;

export const stopNode: NodeDefinition<StopNodeConfig> = {
  type: 'logic.stop',
  version: 1,
  name: 'Stop Execution',
  description: 'Halts workflow execution deliberately with a custom status message and error code.',
  category: 'LOGIC',
  icon: 'octagon',
  inputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  outputs: [],
  mode: 'batch',
  fields: [
    {
      name: 'message',
      label: 'Stop Message',
      type: 'string',
      default: 'Execution stopped by user logic',
      expression: true,
    },
    {
      name: 'errorCode',
      label: 'Error Code',
      type: 'string',
      default: 'STOPPED_BY_USER_LOGIC',
    },
  ],
  configSchema: stopNodeConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {},
  },
  credentials: [],
  execute: async (
    _ctx: NodeContext,
    _items: Item[],
    config: StopNodeConfig
  ): Promise<NodeResult> => {
    throw new BitoError('STOPPED_BY_USER_LOGIC', config.message, {
      details: { userErrorCode: config.errorCode },
    });
  },
};
