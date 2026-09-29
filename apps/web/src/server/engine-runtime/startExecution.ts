import { BitoError, type ExecutionMode, type Item, type Json } from '@bito/shared';
import { getDb } from '../db/client.js';
import { PostgresExecutionStore } from './postgresExecutionStore.js';

export interface StartExecutionParams {
  workflowId: string;
  projectId: string;
  triggerNodeId: string;
  items?: Item[];
  mode?: ExecutionMode;
  versionId?: string;
  vars?: Record<string, Json>;
}

export async function startExecution(params: StartExecutionParams): Promise<string> {
  const sql = getDb();
  const store = new PostgresExecutionStore();

  let versionId = params.versionId;

  // If no versionId provided, attempt to use active_version_id or create a manual_run snapshot
  if (!versionId) {
    const wfRows = await sql`
      SELECT active_version_id, revision, settings FROM workflows WHERE id = ${params.workflowId} LIMIT 1
    `;
    const wf = wfRows[0];
    if (!wf) {
      throw BitoError('NOT_FOUND', `Workflow not found: ${params.workflowId}`);
    }

    if (wf.active_version_id) {
      versionId = wf.active_version_id as string;
    } else {
      // Create manual_run snapshot
      const nodeRows = await sql`
        SELECT id, key, type, type_version, name, config, credential_id, settings
        FROM nodes WHERE workflow_id = ${params.workflowId}
      `;
      const connRows = await sql`
        SELECT id, source_node_id, source_port, target_node_id, target_port
        FROM connections WHERE workflow_id = ${params.workflowId}
      `;

      const snapshot = {
        nodes: nodeRows.map((n) => ({
          id: n.id as string,
          key: n.key as string,
          type: n.type as string,
          typeVersion: Number(n.type_version ?? 1),
          name: n.name as string,
          config: (typeof n.config === 'string' ? JSON.parse(n.config) : n.config) ?? {},
          credentialId: (n.credential_id as string) ?? undefined,
          settings: (typeof n.settings === 'string' ? JSON.parse(n.settings) : n.settings) ?? {},
        })),
        connections: connRows.map((c) => ({
          id: c.id as string,
          sourceNodeId: c.source_node_id as string,
          sourcePort: c.source_port as string,
          targetNodeId: c.target_node_id as string,
          targetPort: c.target_port as string,
        })),
        settings: (typeof wf.settings === 'string' ? JSON.parse(wf.settings) : wf.settings) ?? {},
      };

      const verRows = await sql`
        INSERT INTO workflow_versions (workflow_id, version, snapshot, purpose)
        VALUES (
          ${params.workflowId},
          ${Number(wf.revision ?? 1)},
          ${JSON.stringify(snapshot)}::jsonb,
          'manual_run'
        )
        RETURNING id
      `;
      versionId = verRows[0]?.id as string;
    }
  }

  if (!versionId) {
    throw BitoError('INTERNAL_ERROR', 'Failed to resolve workflow version for execution');
  }

  const items = params.items ?? [{ json: {} }];
  const mode = params.mode ?? 'manual';

  // 1. Insert execution
  const execution = await store.createExecution({
    workflowId: params.workflowId,
    versionId,
    projectId: params.projectId,
    mode,
    triggerNodeId: params.triggerNodeId,
    triggerPayload: items,
    vars: params.vars,
  });

  // 2. Insert trigger job
  await store.enqueueJobs([
    {
      executionId: execution.id,
      nodeId: params.triggerNodeId,
      kind: 'run',
      inputPort: 'main',
      input: items,
      deliveryKey: 'trigger:0',
      attempt: 1,
      runAt: new Date().toISOString(),
    },
  ]);

  // 3. Append system log
  await store.appendLog({
    executionId: execution.id,
    level: 'info',
    kind: 'system',
    message: `Execution queued (${mode})`,
    data: { triggerNodeId: params.triggerNodeId },
  });

  return execution.id;
}
