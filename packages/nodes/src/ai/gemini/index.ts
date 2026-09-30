import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

const CANDIDATE_FALLBACK_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
];

export const geminiNodeConfigSchema = z.object({
  model: z.string().default('gemini-2.5-flash'),
  autoFallback: z.boolean().default(true),
  systemInstruction: z.string().default(''),
  userPrompt: z.string().default(''),
  temperature: z.number().min(0).max(2).default(0.7),
});

export type GeminiNodeConfig = z.infer<typeof geminiNodeConfigSchema>;

export const geminiNode: NodeDefinition<GeminiNodeConfig> = {
  type: 'ai.gemini',
  version: 1,
  name: 'Gemini AI',
  description:
    'Generates responses using Google AI Studio Gemini models with automatic quota-exhaustion fallback.',
  category: 'AI',
  icon: 'bot',
  inputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  mode: 'perItem',
  fields: [
    {
      name: 'model',
      label: 'Primary Model',
      type: 'select',
      default: 'gemini-2.5-flash',
      options: [
        { label: 'Gemini 2.5 Flash (Fastest & Newest)', value: 'gemini-2.5-flash' },
        { label: 'Gemini 2.0 Flash (Next-Gen Flash)', value: 'gemini-2.0-flash' },
        { label: 'Gemini 1.5 Flash (Stable Standard)', value: 'gemini-1.5-flash' },
        { label: 'Gemini 1.5 Flash-8B (High Free Quota)', value: 'gemini-1.5-flash-8b' },
        { label: 'Gemini 1.5 Pro (Deep Reasoning)', value: 'gemini-1.5-pro' },
      ],
    },
    {
      name: 'autoFallback',
      label: 'Auto-Fallback on Quota/Limit (429)',
      type: 'boolean',
      default: true,
      help: 'If selected model quota is exhausted, automatically switch to backup Gemini models so the bot never stops.',
    },
    {
      name: 'systemInstruction',
      label: 'System Prompt / Knowledge Base (Your Information)',
      type: 'text',
      default: 'You are a friendly, helpful customer assistant.',
      help: 'Type your business details, products, prices, FAQs or rules here.',
      expression: true,
    },
    {
      name: 'userPrompt',
      label: 'User Message',
      type: 'text',
      default: '',
      help: 'Incoming message from user (e.g. {{ trigger.body.message.text }}).',
      expression: true,
      required: true,
    },
  ],
  configSchema: geminiNodeConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string' },
      modelUsed: { type: 'string' },
      ok: { type: 'boolean' },
    },
  },
  credentials: [{ type: 'geminiApiKey', required: false }],
  execute: async (
    ctx: NodeContext,
    items: Item[],
    config: GeminiNodeConfig
  ): Promise<NodeResult> => {
    let apiKey = '';
    try {
      const cred = await ctx.getCredential<{ apiKey: string }>('geminiApiKey');
      if (cred?.apiKey) {
        apiKey = cred.apiKey;
      }
    } catch {
      // not assigned
    }

    if (!apiKey) {
      apiKey = process.env.GEMINI_PLATFORM_API_KEY || '';
    }

    const results: Item[] = [];
    for (const _item of items) {
      if (!apiKey) {
        results.push({
          json: {
            ok: false,
            text: 'Error: No Gemini API Key provided. Please connect a Gemini credential or set GEMINI_PLATFORM_API_KEY.',
            modelUsed: config.model,
          },
        });
        continue;
      }

      const promptText = config.userPrompt || 'Hello';
      const bodyPayload: Record<string, unknown> = {
        contents: [
          {
            role: 'user',
            parts: [{ text: promptText }],
          },
        ],
        generationConfig: {
          temperature: config.temperature,
        },
      };

      if (config.systemInstruction?.trim()) {
        bodyPayload.system_instruction = {
          parts: [{ text: config.systemInstruction.trim() }],
        };
      }

      // Build model trial list: primary model first, followed by fallback models
      const modelsToTry = [config.model];
      if (config.autoFallback) {
        for (const m of CANDIDATE_FALLBACK_MODELS) {
          if (!modelsToTry.includes(m)) {
            modelsToTry.push(m);
          }
        }
      }

      let successText = '';
      let usedModel = config.model;
      let lastError = '';

      for (const currentModel of modelsToTry) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            currentModel
          )}:generateContent?key=${encodeURIComponent(apiKey)}`;

          const res = await ctx.http.fetch({
            url,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(bodyPayload),
            timeoutMs: 30000,
          });

          // 429 = Rate limit/Quota, 404 = Model not supported, 503 = Overloaded
          if (res.status === 429 || res.status === 404 || res.status === 503) {
            lastError = `HTTP ${res.status}: ${res.body.slice(0, 150)}`;
            continue; // Try next fallback model
          }

          if (res.status < 200 || res.status >= 300) {
            lastError = `HTTP ${res.status}: ${res.body.slice(0, 150)}`;
            continue;
          }

          let parsed: {
            candidates?: Array<{
              content?: {
                parts?: Array<{ text?: string }>;
              };
            }>;
          };
          try {
            parsed = JSON.parse(res.body);
          } catch {
            parsed = {};
          }

          const candidateText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (candidateText) {
            successText = candidateText;
            usedModel = currentModel;
            break;
          }
        } catch (err: unknown) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }

      if (successText) {
        results.push({
          json: {
            ok: true,
            text: successText,
            modelUsed: usedModel,
          },
        });
      } else {
        results.push({
          json: {
            ok: false,
            text: `AI error: All models failed. Last error: ${lastError}`,
            modelUsed: usedModel,
          },
        });
      }
    }

    return { outputs: { main: results } };
  },
};
