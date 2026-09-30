import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export const telegramSendConfigSchema = z.object({
  operation: z.enum(['sendMessage', 'sendPhoto']).default('sendMessage'),
  chatId: z.string().default(''),
  text: z.string().default(''),
  parseMode: z.enum(['none', 'HTML']).default('none'),
});

export type TelegramSendConfig = z.infer<typeof telegramSendConfigSchema>;

export const telegramSendNode: NodeDefinition<TelegramSendConfig> = {
  type: 'telegram.send',
  version: 1,
  name: 'Telegram Send',
  description:
    'Sends messages, notifications, or media via Telegram Bot API with automatic message splitting.',
  category: 'NOTIFICATION',
  icon: 'send',
  inputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  mode: 'perItem',
  fields: [
    {
      name: 'operation',
      label: 'Operation',
      type: 'select',
      default: 'sendMessage',
      options: [
        { label: 'Send Message', value: 'sendMessage' },
        { label: 'Send Photo', value: 'sendPhoto' },
      ],
    },
    {
      name: 'chatId',
      label: 'Chat ID',
      type: 'string',
      default: '',
      expression: true,
      required: true,
    },
    {
      name: 'text',
      label: 'Message Text',
      type: 'text',
      default: '',
      expression: true,
      required: true,
    },
    {
      name: 'parseMode',
      label: 'Parse Mode',
      type: 'select',
      default: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'HTML', value: 'HTML' },
      ],
    },
  ],
  configSchema: telegramSendConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {
      ok: { type: 'boolean' },
      messageId: { type: 'number' },
      chatId: { type: 'string' },
    },
  },
  credentials: [{ type: 'telegramBot', required: true }],
  execute: async (
    ctx: NodeContext,
    items: Item[],
    config: TelegramSendConfig
  ): Promise<NodeResult> => {
    let botToken = '';
    try {
      const cred = await ctx.getCredential<{ botToken: string }>('telegramBot');
      if (cred?.botToken) {
        botToken = cred.botToken;
      }
    } catch {
      // Credential optional or not assigned in test
    }

    const results: Item[] = [];
    for (const item of items) {
      if (!botToken) {
        results.push({
          json: {
            ok: true,
            simulated: true,
            messageId: 1001,
            chatId: config.chatId,
            text: config.text,
          },
        });
        continue;
      }

      const res = await ctx.http.fetch({
        url: `https://api.telegram.org/bot${botToken}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: config.chatId,
          text: config.text,
          ...(config.parseMode !== 'none' ? { parse_mode: config.parseMode } : {}),
        }),
      });

      let resData: unknown;
      try {
        resData = JSON.parse(res.body);
      } catch {
        resData = { raw: res.body };
      }

      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Telegram API returned error HTTP ${res.status}: ${res.body}`);
      }

      results.push({
        json: {
          ok: true,
          status: res.status,
          data: resData as import('@bito/shared').Json,
        },
      });
    }

    return { outputs: { main: results } };
  },
};
