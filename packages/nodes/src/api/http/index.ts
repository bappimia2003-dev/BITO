import { z } from 'zod';
import type { NodeDefinition, NodeContext, Item, NodeResult } from '@bito/shared';

export const httpNodeConfigSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']).default('GET'),
  url: z.string().default('https://example.com'),
  query: z.record(z.string()).default({}),
  headers: z.record(z.string()).default({}),
  bodyType: z.enum(['none', 'json', 'form', 'raw']).default('none'),
  body: z.string().optional(),
  timeoutMs: z.number().default(15000),
  followRedirects: z.boolean().default(true),
  responseType: z.enum(['json', 'text', 'file']).default('json'),
});

export type HttpNodeConfig = z.infer<typeof httpNodeConfigSchema>;

export const httpNode: NodeDefinition<HttpNodeConfig> = {
  type: 'api.http',
  version: 1,
  name: 'HTTP Request',
  description: 'Sends external HTTP/REST requests through a hardened SSRF-guarded outbound client.',
  category: 'API',
  icon: 'globe',
  inputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  outputs: [{ id: 'main', label: 'Main', kind: 'main' }],
  mode: 'perItem',
  fields: [
    {
      name: 'method',
      label: 'HTTP Method',
      type: 'select',
      default: 'GET',
      options: [
        { label: 'GET', value: 'GET' },
        { label: 'POST', value: 'POST' },
        { label: 'PUT', value: 'PUT' },
        { label: 'PATCH', value: 'PATCH' },
        { label: 'DELETE', value: 'DELETE' },
      ],
    },
    {
      name: 'url',
      label: 'URL',
      type: 'string',
      default: 'https://example.com',
      expression: true,
      required: true,
    },
    {
      name: 'bodyType',
      label: 'Body Format',
      type: 'select',
      default: 'none',
      options: [
        { label: 'None', value: 'none' },
        { label: 'JSON', value: 'json' },
        { label: 'Raw String', value: 'raw' },
      ],
    },
  ],
  configSchema: httpNodeConfigSchema,
  outputSchema: {
    type: 'object',
    properties: {
      status: { type: 'number' },
      ok: { type: 'boolean' },
      headers: { type: 'object' },
      data: { type: 'object' },
    },
  },
  credentials: [
    { type: 'httpBearer', required: false },
    { type: 'httpBasic', required: false },
    { type: 'httpHeader', required: false },
  ],
  execute: async (ctx: NodeContext, items: Item[], config: HttpNodeConfig): Promise<NodeResult> => {
    const results: Item[] = [];

    for (const _item of items) {
      const resp = await ctx.http.fetch({
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: config.body,
        timeoutMs: config.timeoutMs,
      });

      let responseData: unknown = resp.body;
      if (config.responseType === 'json') {
        try {
          responseData = JSON.parse(resp.body);
        } catch {
          responseData = resp.body;
        }
      }

      results.push({
        json: {
          status: resp.status,
          ok: resp.status >= 200 && resp.status < 300,
          headers: resp.headers,
          data: responseData as import('@bito/shared').Json,
        },
      });
    }

    return { outputs: { main: results } };
  },
};
