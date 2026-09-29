import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export const waitNodeConfigSchema = z.object({
  mode: z.enum(['duration', 'until', 'resumeWebhook']).default('duration'),
  amount: z.number().default(5),
  unit: z.enum(['s', 'm', 'h', 'd']).default('s'),
  until: z.string().optional(),
  timeoutSeconds: z.number().optional(),
});

export type WaitNodeConfig = z.infer<typeof waitNodeConfigSchema>;

export const waitNode: NodeDefinition<WaitNodeConfig> = {
  type: 'logic.wait',
  version: 1,
  name: 'Wait / Delay',
  description:
    'Suspends workflow execution until a specified delay, timestamp, or resume webhook is triggered.',
  category: 'LOGIC',
  icon: 'clock',
  inputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  mode: 'batch',
  fields: [
    {
      name: 'mode',
      label: 'Wait Mode',
      type: 'select',
      default: 'duration',
      options: [
        { label: 'Fixed Duration', value: 'duration' },
        { label: 'Until Date/Time', value: 'until' },
        { label: 'Resume Webhook', value: 'resumeWebhook' },
      ],
    },
    {
      name: 'amount',
      label: 'Delay Amount',
      type: 'number',
      default: 5,
    },
    {
      name: 'unit',
      label: 'Time Unit',
      type: 'select',
      default: 's',
      options: [
        { label: 'Seconds', value: 's' },
        { label: 'Minutes', value: 'm' },
        { label: 'Hours', value: 'h' },
        { label: 'Days', value: 'd' },
      ],
    },
  ],
  configSchema: waitNodeConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {},
  },
  credentials: [],
  execute: async (
    _ctx: NodeContext,
    items: Item[],
    config: WaitNodeConfig
  ): Promise<NodeResult> => {
    if (config.mode === 'duration') {
      const multipliers: Record<string, number> = {
        s: 1000,
        m: 60 * 1000,
        h: 60 * 60 * 1000,
        d: 24 * 60 * 60 * 1000,
      };
      const ms = config.amount * (multipliers[config.unit] ?? 1000);
      const untilDate = new Date(Date.now() + ms).toISOString();
      return {
        outputs: { main: items },
        wait: { until: untilDate },
      };
    }

    if (config.mode === 'until' && config.until) {
      return {
        outputs: { main: items },
        wait: { until: config.until },
      };
    }

    return {
      outputs: { main: items },
      wait: { forResume: true },
    };
  },
};
