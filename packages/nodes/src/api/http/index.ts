import { z } from 'zod';
import {
  BitoError,
  type NodeDefinition,
  type NodeContext,
  type Item,
  type NodeResult,
} from '@bito/shared';

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

    // Check credentials if configured
    const requestHeaders = { ...config.headers };
    try {
      const bearer = await ctx.getCredential<{ token: string }>('httpBearer');
      if (bearer?.token) {
        requestHeaders['Authorization'] = `Bearer ${bearer.token}`;
      }
    } catch {
      // Credential not assigned or optional
    }
    try {
      const basic = await ctx.getCredential<{ username: string; password: string }>('httpBasic');
      if (basic?.username) {
        const encoded = Buffer.from(`${basic.username}:${basic.password}`).toString('base64');
        requestHeaders['Authorization'] = `Basic ${encoded}`;
      }
    } catch {
      // Optional
    }
    try {
      const headerCred = await ctx.getCredential<{ headerName: string; headerValue: string }>(
        'httpHeader'
      );
      if (headerCred?.headerName) {
        requestHeaders[headerCred.headerName] = headerCred.headerValue;
      }
    } catch {
      // Optional
    }

    // Build URL with query params
    let finalUrl = config.url;
    if (Object.keys(config.query).length > 0) {
      const parsedUrl = new URL(finalUrl);
      for (const [k, v] of Object.entries(config.query)) {
        parsedUrl.searchParams.set(k, v);
      }
      finalUrl = parsedUrl.toString();
    }

    for (const _item of items) {
      const resp = await ctx.http.fetch({
        url: finalUrl,
        method: config.method,
        headers: requestHeaders,
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

      const is2xx = resp.status >= 200 && resp.status < 300;
      if (!is2xx) {
        const isRetryable = [408, 425, 429, 500, 502, 503, 504].includes(resp.status);
        throw BitoError('HTTP_ERROR', `HTTP ${resp.status}: ${resp.body.slice(0, 200)}`, {
          retryable: isRetryable,
          details: { status: resp.status, body: responseData },
        });
      }

      results.push({
        json: {
          status: resp.status,
          ok: true,
          headers: resp.headers,
          data: responseData as import('@bito/shared').Json,
        },
      });
    }

    return { outputs: { main: results } };
  },
  onError: (_ctx, err) => {
    const status = (err.details as { status?: number } | undefined)?.status;
    if (status && [408, 425, 429, 500, 502, 503, 504].includes(status)) {
      return { retryable: true };
    }
    return undefined;
  },
};
