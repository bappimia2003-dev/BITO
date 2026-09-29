import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';
import { encryptJson, decryptJson } from '../security/crypto.js';
import {
  type CredentialType,
  parseCredentialData,
  computeCredentialHint,
} from './credentialSchemas.js';
import { recordAuditLog } from './audit.js';

export const credentialSummarySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid(),
  type: z.string(),
  name: z.string(),
  keyVersion: z.number().int(),
  hint: z.preprocess(
    (val) => (typeof val === 'string' ? JSON.parse(val) : val),
    z.record(z.unknown())
  ),
  createdBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  usedByCount: z.coerce.number().int().default(0),
});

export type CredentialSummary = z.infer<typeof credentialSummarySchema>;

export const credentialDependencySchema = z.object({
  nodeId: z.string().uuid(),
  nodeKey: z.string(),
  nodeType: z.string(),
  workflowId: z.string().uuid(),
  workflowName: z.string(),
  workflowStatus: z.string(),
});

export type CredentialDependency = z.infer<typeof credentialDependencySchema>;

export async function listCredentials(
  actor: Actor,
  projectId: string
): Promise<CredentialSummary[]> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  // NEVER SELECT ciphertext, iv, auth_tag to the frontend (SPEC Section 13.3)
  const rows = await sql`
    SELECT
      id, project_id, type, name, key_version, hint, created_by, created_at, updated_at,
      (SELECT COUNT(*)::int FROM nodes WHERE nodes.credential_id = credentials.id) AS used_by_count
    FROM credentials
    WHERE project_id = ${projectId}
    ORDER BY name ASC
  `;
  return rows.map((r) => parseRow(credentialSummarySchema, r));
}

export async function findCredentialSummaryById(
  actor: Actor,
  credentialId: string
): Promise<CredentialSummary> {
  const sql = getDb();
  const rows = await sql`
    SELECT
      id, project_id, type, name, key_version, hint, created_by, created_at, updated_at,
      (SELECT COUNT(*)::int FROM nodes WHERE nodes.credential_id = credentials.id) AS used_by_count
    FROM credentials
    WHERE id = ${credentialId}
  `;
  const row = rows[0];
  if (!row) {
    throw BitoError('NOT_FOUND', `Credential not found: ${credentialId}`, { httpStatus: 404 });
  }

  await assertProjectRole(actor, row.project_id, 'viewer');
  return parseRow(credentialSummarySchema, row);
}

export async function createCredential(
  actor: Actor,
  projectId: string,
  input: {
    name: string;
    type: CredentialType;
    data: unknown;
  }
): Promise<CredentialSummary> {
  await assertProjectRole(actor, projectId, 'editor');

  const name = input.name.trim();
  if (!name) {
    throw BitoError('VALIDATION_FAILED', 'Credential name is required', { httpStatus: 400 });
  }

  const validatedData = parseCredentialData(input.type, input.data);
  const hint = computeCredentialHint(input.type, validatedData);
  const id = randomUUID();
  const enc = encryptJson(validatedData, id);

  const sql = getDb();
  try {
    const rows = await sql`
      INSERT INTO credentials (
        id, project_id, type, name, ciphertext, iv, auth_tag, key_version, hint, created_by
      ) VALUES (
        ${id}, ${projectId}, ${input.type}, ${name}, ${enc.ciphertext},
        ${enc.iv}, ${enc.authTag}, ${enc.keyVersion}, ${JSON.stringify(hint)}::jsonb, ${actor.userId}
      )
      RETURNING
        id, project_id, type, name, key_version, hint, created_by, created_at, updated_at,
        0 as used_by_count
    `;

    const row = rows[0];
    if (!row) throw BitoError('PROVIDER_ERROR', 'Failed to create credential');

    await recordAuditLog({
      userId: actor.userId,
      projectId,
      action: 'credential.create',
      targetType: 'credential',
      targetId: id,
      meta: { name, type: input.type },
    });

    return parseRow(credentialSummarySchema, row);
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === '23505'
    ) {
      throw BitoError(
        'VALIDATION_FAILED',
        `A credential with name "${name}" already exists in this project`,
        { httpStatus: 409 }
      );
    }
    throw error;
  }
}

export async function replaceCredentialSecret(
  actor: Actor,
  credentialId: string,
  input: { data: unknown }
): Promise<CredentialSummary> {
  const sql = getDb();
  const existingRows = await sql`
    SELECT id, project_id, type, name FROM credentials WHERE id = ${credentialId}
  `;
  const existing = existingRows[0];
  if (!existing) {
    throw BitoError('NOT_FOUND', `Credential not found: ${credentialId}`, { httpStatus: 404 });
  }

  await assertProjectRole(actor, existing.project_id, 'editor');

  const validatedData = parseCredentialData(existing.type as CredentialType, input.data);
  const hint = computeCredentialHint(existing.type as CredentialType, validatedData);
  const enc = encryptJson(validatedData, credentialId);

  const rows = await sql`
    UPDATE credentials
    SET
      ciphertext = ${enc.ciphertext},
      iv = ${enc.iv},
      auth_tag = ${enc.authTag},
      key_version = ${enc.keyVersion},
      hint = ${JSON.stringify(hint)}::jsonb,
      updated_at = NOW()
    WHERE id = ${credentialId}
    RETURNING
      id, project_id, type, name, key_version, hint, created_by, created_at, updated_at,
      (SELECT COUNT(*)::int FROM nodes WHERE nodes.credential_id = credentials.id) AS used_by_count
  `;

  const row = rows[0];
  if (!row)
    throw BitoError('NOT_FOUND', `Credential not found: ${credentialId}`, { httpStatus: 404 });

  await recordAuditLog({
    userId: actor.userId,
    projectId: existing.project_id,
    action: 'credential.replace',
    targetType: 'credential',
    targetId: credentialId,
    meta: { name: existing.name, type: existing.type },
  });

  return parseRow(credentialSummarySchema, row);
}

export async function updateCredentialName(
  actor: Actor,
  credentialId: string,
  name: string
): Promise<CredentialSummary> {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw BitoError('VALIDATION_FAILED', 'Credential name is required', { httpStatus: 400 });
  }

  const sql = getDb();
  const existingRows = await sql`
    SELECT id, project_id, name, type FROM credentials WHERE id = ${credentialId}
  `;
  const existing = existingRows[0];
  if (!existing) {
    throw BitoError('NOT_FOUND', `Credential not found: ${credentialId}`, { httpStatus: 404 });
  }

  await assertProjectRole(actor, existing.project_id, 'editor');

  const rows = await sql`
    UPDATE credentials
    SET name = ${trimmedName}, updated_at = NOW()
    WHERE id = ${credentialId}
    RETURNING
      id, project_id, type, name, key_version, hint, created_by, created_at, updated_at,
      (SELECT COUNT(*)::int FROM nodes WHERE nodes.credential_id = credentials.id) AS used_by_count
  `;

  const row = rows[0];
  if (!row)
    throw BitoError('NOT_FOUND', `Credential not found: ${credentialId}`, { httpStatus: 404 });
  return parseRow(credentialSummarySchema, row);
}

export async function getCredentialDependencies(
  actor: Actor,
  credentialId: string
): Promise<CredentialDependency[]> {
  const sql = getDb();
  const credRows = await sql`
    SELECT id, project_id FROM credentials WHERE id = ${credentialId}
  `;
  const cred = credRows[0];
  if (!cred) {
    throw BitoError('NOT_FOUND', `Credential not found: ${credentialId}`, { httpStatus: 404 });
  }

  await assertProjectRole(actor, cred.project_id, 'viewer');

  const rows = await sql`
    SELECT
      n.id AS node_id, n.key AS node_key, n.type AS node_type,
      w.id AS workflow_id, w.name AS workflow_name, w.status AS workflow_status
    FROM nodes n
    JOIN workflows w ON w.id = n.workflow_id
    WHERE n.credential_id = ${credentialId}
    ORDER BY w.name ASC, n.key ASC
  `;

  return rows.map((r) => parseRow(credentialDependencySchema, r));
}

export async function deleteCredential(actor: Actor, credentialId: string): Promise<void> {
  const sql = getDb();
  const credRows = await sql`
    SELECT id, project_id, type, name FROM credentials WHERE id = ${credentialId}
  `;
  const cred = credRows[0];
  if (!cred) {
    throw BitoError('NOT_FOUND', `Credential not found: ${credentialId}`, { httpStatus: 404 });
  }

  await assertProjectRole(actor, cred.project_id, 'editor');

  const dependents = await getCredentialDependencies(actor, credentialId);
  if (dependents.length > 0) {
    throw BitoError(
      'CREDENTIAL_IN_USE',
      `Cannot delete credential "${cred.name}" because it is currently used by ${dependents.length} workflow node(s)`,
      { httpStatus: 409, details: { dependents } }
    );
  }

  await sql`DELETE FROM credentials WHERE id = ${credentialId}`;

  await recordAuditLog({
    userId: actor.userId,
    projectId: cred.project_id,
    action: 'credential.delete',
    targetType: 'credential',
    targetId: credentialId,
    meta: { name: cred.name, type: cred.type },
  });
}

/**
 * INTERNAL USE ONLY — Retrieves and decrypts secret payload for engine execution
 * or credential testing. NEVER exposed to frontend endpoints.
 */
export async function getDecryptedCredentialPayload<T = Record<string, unknown>>(
  credentialId: string
): Promise<{
  id: string;
  projectId: string;
  type: CredentialType;
  name: string;
  data: T;
}> {
  const sql = getDb();
  const rows = await sql`
    SELECT id, project_id, type, name, ciphertext, iv, auth_tag, key_version
    FROM credentials
    WHERE id = ${credentialId}
  `;
  const row = rows[0];
  if (!row) {
    throw BitoError('NOT_FOUND', `Credential not found: ${credentialId}`, { httpStatus: 404 });
  }

  const data = decryptJson<T>(
    {
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
      keyVersion: row.key_version,
    },
    credentialId
  );

  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type as CredentialType,
    name: row.name,
    data,
  };
}
