import { redact } from '@bito/shared';
import { getDb } from '../db/client.js';

export interface AuditLogEntry {
  id?: string;
  userId?: string | null;
  projectId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
  createdAt?: string;
}

export async function recordAuditLog(entry: {
  userId?: string | null;
  projectId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}): Promise<void> {
  const sql = getDb();
  // Ensure metadata never contains secrets (SPEC Section 17)
  const safeMeta = entry.meta ? (redact(entry.meta) as Record<string, unknown>) : {};

  await sql`
    INSERT INTO audit_logs (
      user_id,
      project_id,
      action,
      target_type,
      target_id,
      ip,
      user_agent,
      meta
    ) VALUES (
      ${entry.userId ?? null},
      ${entry.projectId ?? null},
      ${entry.action},
      ${entry.targetType ?? null},
      ${entry.targetId ?? null},
      ${entry.ip ?? null},
      ${entry.userAgent ?? null},
      ${JSON.stringify(safeMeta)}::jsonb
    )
  `;
}

export async function listAuditLogs(
  projectId: string,
  cursor?: string,
  limit: number = 50
): Promise<AuditLogEntry[]> {
  const sql = getDb();
  const clampedLimit = Math.min(Math.max(1, limit), 100);

  const rows = cursor
    ? await sql`
        SELECT id, user_id, project_id, action, target_type, target_id, ip::text, user_agent, meta, created_at
        FROM audit_logs
        WHERE project_id = ${projectId} AND id < ${cursor}
        ORDER BY created_at DESC, id DESC
        LIMIT ${clampedLimit}
      `
    : await sql`
        SELECT id, user_id, project_id, action, target_type, target_id, ip::text, user_agent, meta, created_at
        FROM audit_logs
        WHERE project_id = ${projectId}
        ORDER BY created_at DESC, id DESC
        LIMIT ${clampedLimit}
      `;

  return rows.map((r) => ({
    id: String(r.id),
    userId: (r.user_id as string) ?? null,
    projectId: (r.project_id as string) ?? null,
    action: r.action as string,
    targetType: (r.target_type as string) ?? null,
    targetId: (r.target_id as string) ?? null,
    ip: (r.ip as string) ?? null,
    userAgent: (r.user_agent as string) ?? null,
    meta: (r.meta as Record<string, unknown>) ?? {},
    createdAt: (r.created_at as Date).toISOString(),
  }));
}
