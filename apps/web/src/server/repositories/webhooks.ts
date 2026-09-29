import { randomBytes, createHash } from 'node:crypto';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { parseRow } from './base.js';
import { encryptCredential, decryptCredential } from '../security/crypto.js';
import { BitoError } from '@bito/shared';

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

export interface WebhookLookupResult extends WebhookEndpoint {
  workflowStatus: string;
  activeVersionId: string | null;
  projectId: string;
  secretPlaintext?: string | null;
}

export interface WebhookEndpointWithSecret extends WebhookEndpoint {
  secret?: string | null;
}

export async function findWebhookByToken(token: string): Promise<WebhookLookupResult | null> {
  const sql = getDb();
  const rows = await sql`
    SELECT e.id, e.workflow_id, e.node_id, e.provider, e.token,
           e.secret_ciphertext, e.secret_iv, e.secret_auth_tag,
           e.secret_hash, e.credential_id, e.config, e.is_active, e.created_at,
           w.status as workflow_status, w.active_version_id, w.project_id
    FROM webhook_endpoints e
    JOIN workflows w ON w.id = e.workflow_id
    WHERE e.token = ${token}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;

  let secretPlaintext: string | null = null;
  if (row.secret_ciphertext && row.secret_iv && row.secret_auth_tag) {
    try {
      secretPlaintext = decryptCredential(
        {
          ciphertext: row.secret_ciphertext as Buffer,
          iv: row.secret_iv as Buffer,
          authTag: row.secret_auth_tag as Buffer,
          keyVersion: 1,
        },
        row.id as string
      );
    } catch {
      secretPlaintext = null;
    }
  }

  return {
    ...parseRow(webhookEndpointSchema, row),
    workflowStatus: row.workflow_status as string,
    activeVersionId: (row.active_version_id as string) ?? null,
    projectId: row.project_id as string,
    secretPlaintext,
  };
}

export async function recordWebhookEvent(endpointId: string, eventKey: string): Promise<boolean> {
  const sql = getDb();
  const rows = await sql`
    INSERT INTO webhook_events (endpoint_id, event_key)
    VALUES (${endpointId}, ${eventKey})
    ON CONFLICT (endpoint_id, event_key) DO NOTHING
    RETURNING id
  `;
  return rows.length > 0;
}

export async function upsertWebhookEndpoint(params: {
  workflowId: string;
  nodeId: string;
  provider: 'generic' | 'telegram' | 'whatsapp' | 'meta' | 'resume';
  config?: Record<string, unknown>;
  initialSecret?: string;
}): Promise<{ id: string; token: string; secret: string }> {
  const sql = getDb();
  const token = randomBytes(32).toString('base64url');
  const secret = params.initialSecret ?? randomBytes(32).toString('hex');
  const config = params.config ?? { methods: ['POST'], requireSignature: true };

  const existingRows = await sql`
    SELECT id, token FROM webhook_endpoints
    WHERE workflow_id = ${params.workflowId} AND node_id = ${params.nodeId} AND provider = ${params.provider}
    LIMIT 1
  `;

  if (existingRows.length > 0) {
    const existingId = existingRows[0]!.id as string;
    const existingToken = existingRows[0]!.token as string;
    const enc = encryptCredential(secret, existingId, 1);
    const secretHash = createHash('sha256').update(secret).digest('hex');

    await sql`
      UPDATE webhook_endpoints
      SET config = ${sql.json(config as never)},
          secret_ciphertext = ${enc.ciphertext},
          secret_iv = ${enc.iv},
          secret_auth_tag = ${enc.authTag},
          secret_hash = ${secretHash},
          is_active = true
      WHERE id = ${existingId}
    `;

    return {
      id: existingId,
      token: existingToken,
      secret,
    };
  }

  const id = crypto.randomUUID();
  const enc = encryptCredential(secret, id, 1);
  const secretHash = createHash('sha256').update(secret).digest('hex');

  await sql`
    INSERT INTO webhook_endpoints (
      id, workflow_id, node_id, provider, token,
      secret_ciphertext, secret_iv, secret_auth_tag, secret_hash,
      config, is_active
    ) VALUES (
      ${id}, ${params.workflowId}, ${params.nodeId}, ${params.provider}, ${token},
      ${enc.ciphertext}, ${enc.iv}, ${enc.authTag}, ${secretHash},
      ${sql.json(config as never)}, true
    )
  `;

  return { id, token, secret };
}

export async function rotateWebhookTokenAndSecret(
  endpointId: string,
  workflowId: string
): Promise<{ token: string; secret: string }> {
  const sql = getDb();
  const newToken = randomBytes(32).toString('base64url');
  const newSecret = randomBytes(32).toString('hex');
  const enc = encryptCredential(newSecret, endpointId, 1);
  const secretHash = createHash('sha256').update(newSecret).digest('hex');

  const rows = await sql`
    UPDATE webhook_endpoints
    SET token = ${newToken},
        secret_ciphertext = ${enc.ciphertext},
        secret_iv = ${enc.iv},
        secret_auth_tag = ${enc.authTag},
        secret_hash = ${secretHash}
    WHERE id = ${endpointId} AND workflow_id = ${workflowId}
    RETURNING id, token
  `;

  if (rows.length === 0) {
    throw new BitoError('NOT_FOUND', `Webhook endpoint ${endpointId} not found`);
  }

  return { token: newToken, secret: newSecret };
}

export async function listWebhooksForWorkflow(
  workflowId: string
): Promise<WebhookEndpointWithSecret[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, workflow_id, node_id, provider, token,
           secret_ciphertext, secret_iv, secret_auth_tag,
           secret_hash, credential_id, config, is_active, created_at
    FROM webhook_endpoints
    WHERE workflow_id = ${workflowId}
    ORDER BY created_at ASC
  `;

  return rows.map((r) => {
    let secret: string | null = null;
    if (r.secret_ciphertext && r.secret_iv && r.secret_auth_tag) {
      try {
        secret = decryptCredential(
          {
            ciphertext: r.secret_ciphertext as Buffer,
            iv: r.secret_iv as Buffer,
            authTag: r.secret_auth_tag as Buffer,
            keyVersion: 1,
          },
          r.id as string
        );
      } catch {
        secret = null;
      }
    }
    return {
      ...parseRow(webhookEndpointSchema, r),
      secret,
    };
  });
}
