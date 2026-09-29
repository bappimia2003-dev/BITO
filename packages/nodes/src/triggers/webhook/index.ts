import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export const webhookTriggerConfigSchema = z.object({
  path: z.string().optional().default(''),
  methods: z.array(z.string()).default(['POST']),
  requireSignature: z.boolean().default(true),
});

export type WebhookTriggerConfig = z.infer<typeof webhookTriggerConfigSchema>;

export const webhookTriggerNode: NodeDefinition<WebhookTriggerConfig> = {
  type: 'trigger.webhook',
  version: 1,
  name: 'Webhook Trigger',
  description:
    'Triggers workflow executions via inbound HTTP webhooks with optional cryptographic verification.',
  category: 'TRIGGERS',
  icon: 'webhook',
  inputs: [],
  outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  mode: 'batch',
  fields: [
    {
      name: 'path',
      label: 'Webhook Path',
      type: 'string',
      default: '',
      help: 'Custom endpoint path slug.',
    },
    {
      name: 'methods',
      label: 'Allowed Methods',
      type: 'select',
      default: ['POST'],
      options: [
        { label: 'POST', value: 'POST' },
        { label: 'GET', value: 'GET' },
        { label: 'PUT', value: 'PUT' },
      ],
    },
    {
      name: 'requireSignature',
      label: 'Require Secret Signature',
      type: 'boolean',
      default: true,
    },
  ],
  configSchema: webhookTriggerConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {
      method: { type: 'string' },
      headers: { type: 'object' },
      query: { type: 'object' },
      body: { type: 'object' },
    },
  },
  credentials: [],
  execute: async (
    _ctx: NodeContext,
    items: Item[],
    _config: WebhookTriggerConfig
  ): Promise<NodeResult> => {
    return { outputs: { main: items } };
  },
};
