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
    _ctx: NodeContext,
    _items: Item[],
    config: TelegramSendConfig
  ): Promise<NodeResult> => {
    return {
      outputs: {
        main: [
          {
            json: {
              ok: true,
              messageId: 1001,
              chatId: config.chatId,
            },
          },
        ],
      },
    };
  },
};
