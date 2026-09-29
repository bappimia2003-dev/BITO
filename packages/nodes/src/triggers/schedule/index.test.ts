import { describe, it, expect } from 'vitest';
import {
  scheduleTriggerNode,
  scheduleTriggerConfigSchema,
  isValidCronExpression,
  isValidIanaTimeZone,
} from './index.js';

describe('trigger.schedule Node Definition', () => {
  it('validates 5-field cron expressions across different timezones', () => {
    expect(isValidCronExpression('0 9 * * *')).toBe(true);
    expect(isValidCronExpression('*/5 * * * *')).toBe(true);
    expect(isValidCronExpression('0 0 1 1 *')).toBe(true);
    expect(isValidCronExpression('30 4 * * 1-5')).toBe(true);

    // Rejects 6 fields (sub-minute / seconds)
    expect(isValidCronExpression('* * * * * *')).toBe(false);
    expect(isValidCronExpression('*/10 * * * * *')).toBe(false);

    // Rejects bogus expressions
    expect(isValidCronExpression('invalid cron')).toBe(false);
    expect(isValidCronExpression('')).toBe(false);
  });

  it('validates IANA timezone identifiers', () => {
    expect(isValidIanaTimeZone('UTC')).toBe(true);
    expect(isValidIanaTimeZone('Asia/Dhaka')).toBe(true);
    expect(isValidIanaTimeZone('America/New_York')).toBe(true);
    expect(isValidIanaTimeZone('Europe/London')).toBe(true);

    expect(isValidIanaTimeZone('Invalid/Timezone')).toBe(false);
    expect(isValidIanaTimeZone('')).toBe(false);
  });

  it('parses valid schedule configuration with schema defaults', () => {
    const parsed = scheduleTriggerConfigSchema.parse({});
    expect(parsed.cron).toBe('0 * * * *');
    expect(parsed.timezone).toBe('UTC');

    const custom = scheduleTriggerConfigSchema.parse({
      cron: '0 9 * * *',
      timezone: 'Asia/Dhaka',
    });
    expect(custom.cron).toBe('0 9 * * *');
    expect(custom.timezone).toBe('Asia/Dhaka');
  });

  it('rejects invalid cron and timezone in config schema', () => {
    expect(() =>
      scheduleTriggerConfigSchema.parse({
        cron: '* * * * * *', // 6 fields
      })
    ).toThrow();

    expect(() =>
      scheduleTriggerConfigSchema.parse({
        timezone: 'Not/Real',
      })
    ).toThrow();
  });

  it('executes and passes items through correctly', async () => {
    const inputItems = [
      {
        json: {
          scheduledFor: '2026-09-30T09:00:00.000Z',
          firedAt: '2026-09-30T09:00:01.000Z',
        },
      },
    ];
    const ctx = {} as never;

    const result = await scheduleTriggerNode.execute(ctx, inputItems, {
      cron: '0 9 * * *',
      timezone: 'Asia/Dhaka',
    });

    expect(result.outputs?.['main']).toEqual(inputItems);
  });
});
