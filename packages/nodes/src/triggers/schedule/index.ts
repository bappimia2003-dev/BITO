import { z } from 'zod';
import { CronExpressionParser } from 'cron-parser';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export function isValidCronExpression(cron: string): boolean {
  if (!cron || typeof cron !== 'string') return false;
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  try {
    CronExpressionParser.parse(cron.trim());
    return true;
  } catch {
    return false;
  }
}

export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const scheduleTriggerConfigSchema = z.object({
  cron: z.string().default('0 * * * *').refine(isValidCronExpression, {
    message: 'Must be a valid 5-field cron expression (sub-minute is not allowed)',
  }),
  timezone: z.string().default('UTC').refine(isValidIanaTimeZone, {
    message: 'Must be a valid IANA timezone name (e.g. UTC, Asia/Dhaka, America/New_York)',
  }),
});

export type ScheduleTriggerConfig = z.infer<typeof scheduleTriggerConfigSchema>;

export const scheduleTriggerNode: NodeDefinition<ScheduleTriggerConfig> = {
  type: 'trigger.schedule',
  version: 1,
  name: 'Schedule Trigger',
  description: 'Triggers workflow executions on a recurring cron schedule with timezone awareness.',
  category: 'TRIGGERS',
  icon: 'clock',
  inputs: [],
  outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  mode: 'batch',
  fields: [
    {
      name: 'cron',
      label: 'Cron Expression',
      type: 'string',
      default: '0 * * * *',
      help: 'Standard 5-field cron (minute hour day-of-month month day-of-week). Sub-minute is not allowed.',
    },
    {
      name: 'timezone',
      label: 'Timezone',
      type: 'string',
      default: 'UTC',
      help: 'IANA timezone identifier (e.g. UTC, Asia/Dhaka, America/New_York).',
    },
  ],
  configSchema: scheduleTriggerConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {
      scheduledFor: { type: 'string' },
      firedAt: { type: 'string' },
    },
  },
  credentials: [],
  execute: async (
    _ctx: NodeContext,
    items: Item[],
    _config: ScheduleTriggerConfig
  ): Promise<NodeResult> => {
    return { outputs: { main: items } };
  },
};
