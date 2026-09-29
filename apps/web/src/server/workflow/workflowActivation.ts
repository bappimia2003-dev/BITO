import { BitoError } from '@bito/shared';
import { validateGraph, defaultNodeRegistry, type WorkflowSnapshot } from '@bito/engine';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { findWorkflowById } from '../repositories/workflows.js';
import { getWorkflowWithGraph } from '../repositories/workflowGraph.js';
import { upsertWebhookEndpoint } from '../repositories/webhooks.js';
import { upsertSchedule } from '../repositories/schedules.js';
import { nextOccurrence } from '../scheduler/scheduleService.js';
import { recordAuditLog } from '../repositories/audit.js';

export interface ActivationResult {
  ok: boolean;
  versionId: string;
  versionNum: number;
}

export async function activateWorkflow(
  actor: Actor,
  workflowId: string,
  ip?: string,
  userAgent?: string
): Promise<ActivationResult> {
  const workflow = await findWorkflowById(actor, workflowId);
  await assertProjectRole(actor, workflow.projectId, 'editor');

  const graph = await getWorkflowWithGraph(actor, workflowId);
  const snapshot: WorkflowSnapshot = {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      key: n.key,
      type: n.type,
      name: n.name,
      config: n.config,
      settings: n.settings,
      credentialId: n.credentialId ?? undefined,
    })),
    connections: graph.connections.map((c) => ({
      id: c.id ?? crypto.randomUUID(),
      sourceNodeId: c.sourceNodeId,
      sourcePort: c.sourcePort,
      targetNodeId: c.targetNodeId,
      targetPort: c.targetPort,
    })),
  };

  // 1. Validate graph
  const issues = validateGraph(snapshot, { registry: defaultNodeRegistry });
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new BitoError('VALIDATION_FAILED', 'Cannot activate workflow with validation errors', {
      httpStatus: 422,
      details: { issues },
    });
  }

  const sql = getDb();

  return await sql.begin(async (tx) => {
    // 2. Create version snapshot (purpose='activation')
    const versionNumRows = await tx`
      SELECT COALESCE(MAX(version_num), 0) + 1 as next_num
      FROM workflow_versions
      WHERE workflow_id = ${workflowId}
    `;
    const versionNum = Number(versionNumRows[0]!.next_num);
    const versionId = crypto.randomUUID();

    await tx`
      INSERT INTO workflow_versions (
        id, workflow_id, version_num, snapshot, purpose, created_by
      ) VALUES (
        ${versionId}, ${workflowId}, ${versionNum}, ${sql.json(snapshot as never)}, 'activation', ${actor.userId}
      )
    `;

    // 3. Provision triggers (webhooks, schedules)
    for (const node of graph.nodes) {
      if (node.type === 'trigger.webhook') {
        await upsertWebhookEndpoint({
          workflowId,
          nodeId: node.id,
          provider: 'generic',
          config: node.config,
        });
      } else if (node.type === 'trigger.schedule') {
        const cron = (node.config['cron'] as string) || '0 * * * *';
        const timezone = (node.config['timezone'] as string) || 'UTC';
        const nextRunAt = nextOccurrence(cron, timezone);

        await upsertSchedule({
          workflowId,
          nodeId: node.id,
          cron,
          timezone,
          nextRunAt,
          enabled: true,
        });
      }
    }

    // 4. Update workflow status to active
    await tx`
      UPDATE workflows
      SET status = 'active',
          active_version_id = ${versionId},
          updated_at = NOW()
      WHERE id = ${workflowId}
    `;

    // 5. Audit log
    await recordAuditLog({
      userId: actor.userId,
      projectId: workflow.projectId,
      action: 'workflow.activate',
      targetType: 'workflow',
      targetId: workflowId,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
      meta: { versionId, versionNum },
    });

    return {
      ok: true,
      versionId,
      versionNum,
    };
  });
}

export async function deactivateWorkflow(
  actor: Actor,
  workflowId: string,
  ip?: string,
  userAgent?: string
): Promise<{ ok: boolean }> {
  const workflow = await findWorkflowById(actor, workflowId);
  await assertProjectRole(actor, workflow.projectId, 'editor');

  const sql = getDb();

  return await sql.begin(async (tx) => {
    // 1. Disable endpoints
    await tx`
      UPDATE webhook_endpoints
      SET is_active = false
      WHERE workflow_id = ${workflowId}
    `;

    // 2. Disable schedules
    await tx`
      UPDATE schedules
      SET enabled = false
      WHERE workflow_id = ${workflowId}
    `;

    // 3. Set workflow status to draft
    await tx`
      UPDATE workflows
      SET status = 'draft',
          updated_at = NOW()
      WHERE id = ${workflowId}
    `;

    // 4. Audit log
    await recordAuditLog({
      userId: actor.userId,
      projectId: workflow.projectId,
      action: 'workflow.deactivate',
      targetType: 'workflow',
      targetId: workflowId,
      ip: ip ?? null,
      userAgent: userAgent ?? null,
    });

    return { ok: true };
  });
}
