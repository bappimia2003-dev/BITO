import { z } from 'zod';
import { getDb } from '../db/client.js';
import { parseRow } from './base.js';

export const webhookEndpointSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  nodeId: z.string().uuid(),
  provider: z.enum(['generic', 'telegram', 'whatsapp', 'meta', 'resume']),
  token: z.string(),
  secretHash: z.string().nullable().optional(),
  credentialId: z.string().uuid().nullable().optional(),
  config: z.record(z.unknown()).default({}),
  isActive: z.boolean().default(true),
  createdAt: z.string(),
});

export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

export async function findWebhookByToken(token: string): Promise<WebhookEndpoint | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, workflow_id, node_id, provider, token, secret_hash, credential_id, config, is_active, created_at
    FROM webhook_endpoints
    WHERE token = ${token} AND is_active = true
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return parseRow(webhookEndpointSchema, row);
}
