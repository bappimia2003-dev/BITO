import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { findWorkflowById, type Workflow } from './workflows.js';

export const workflowNodeSchema = z.object({
  id: z.string().uuid(),
  key: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),
  type: z.string(),
  typeVersion: z.number().int().default(1),
  name: z.string(),
  positionX: z.number().default(0),
  positionY: z.number().default(0),
  config: z.record(z.unknown()).default({}),
  credentialId: z.string().uuid().nullable().optional(),
  settings: z.record(z.unknown()).default({}),
});

export type WorkflowNode = z.infer<typeof workflowNodeSchema>;
export type WorkflowNodeInput = z.input<typeof workflowNodeSchema>;

export const workflowConnectionSchema = z.object({
  id: z.string().uuid().optional(),
  sourceNodeId: z.string().uuid(),
  sourcePort: z.string().default('main'),
  targetNodeId: z.string().uuid(),
  targetPort: z.string().default('main'),
});

export type WorkflowConnection = z.infer<typeof workflowConnectionSchema>;
export type WorkflowConnectionInput = z.input<typeof workflowConnectionSchema>;

export interface WorkflowWithGraph {
  workflow: Workflow;
  nodes: WorkflowNode[];
  connections: WorkflowConnection[];
  [key: string]: unknown;
}

export async function getWorkflowWithGraph(
  actor: Actor,
  workflowId: string
): Promise<WorkflowWithGraph> {
  const workflow = await findWorkflowById(actor, workflowId);
  const sql = getDb();

  const nodeRows = await sql`
    SELECT id, key, type, type_version, name, position_x, position_y, config, credential_id, settings
    FROM nodes
    WHERE workflow_id = ${workflowId}
    ORDER BY created_at ASC
  `;

  const connRows = await sql`
    SELECT id, source_node_id, source_port, target_node_id, target_port
    FROM connections
    WHERE workflow_id = ${workflowId}
  `;

  const nodes: WorkflowNode[] = nodeRows.map((n) => ({
    id: n.id as string,
    key: n.key as string,
    type: n.type as string,
    typeVersion: Number(n.type_version ?? 1),
    name: n.name as string,
    positionX: Number(n.position_x ?? 0),
    positionY: Number(n.position_y ?? 0),
    config: (typeof n.config === 'string' ? JSON.parse(n.config) : n.config) ?? {},
    credentialId: (n.credential_id as string) ?? null,
    settings: (typeof n.settings === 'string' ? JSON.parse(n.settings) : n.settings) ?? {},
  }));

  const connections: WorkflowConnection[] = connRows.map((c) => ({
    id: c.id as string,
    sourceNodeId: c.source_node_id as string,
    sourcePort: c.source_port as string,
    targetNodeId: c.target_node_id as string,
    targetPort: c.target_port as string,
  }));

  return { workflow, nodes, connections };
}

export async function saveWorkflowGraph(
  actor: Actor,
  workflowId: string,
  data: {
    expectedRevision?: number;
    name?: string;
    description?: string;
    settings?: Record<string, unknown>;
    status?: 'draft' | 'active' | 'archived';
    nodes?: WorkflowNodeInput[];
    connections?: WorkflowConnectionInput[];
  }
): Promise<WorkflowWithGraph> {
  const existing = await findWorkflowById(actor, workflowId);
  await assertProjectRole(actor, existing.projectId, 'editor');

  if (data.expectedRevision !== undefined && data.expectedRevision !== existing.revision) {
    throw BitoError('REVISION_CONFLICT', 'Workflow has been modified by another session', {
      httpStatus: 409,
      details: { currentRevision: existing.revision, expectedRevision: data.expectedRevision },
    });
  }

  const sql = getDb();
  return await sql.begin(async (tx) => {
    // 1. Update workflow meta & revision
    const [updatedWf] = await tx`
      UPDATE workflows
      SET 
        name = COALESCE(${data.name ?? null}, name),
        description = COALESCE(${data.description ?? null}, description),
        settings = CASE 
          WHEN ${data.settings !== undefined} THEN ${JSON.stringify(data.settings ?? {})}::jsonb 
          ELSE settings 
        END,
        status = COALESCE(${data.status ?? null}, status),
        revision = revision + 1,
        updated_at = NOW()
      WHERE id = ${workflowId}
      RETURNING id, project_id, name, description, status, active_version_id, revision, settings, created_by, created_at, updated_at
    `;

    if (!updatedWf) {
      throw BitoError('NOT_FOUND', 'Workflow not found', { httpStatus: 404 });
    }

    // 2. Synchronize nodes if provided
    if (data.nodes !== undefined) {
      const incomingNodeIds = new Set(data.nodes.map((n) => n.id));

      // Remove nodes no longer in graph
      if (incomingNodeIds.size === 0) {
        await tx`DELETE FROM nodes WHERE workflow_id = ${workflowId}`;
      } else {
        await tx`
          DELETE FROM nodes 
          WHERE workflow_id = ${workflowId} AND id NOT IN ${tx(Array.from(incomingNodeIds))}
        `;
      }

      // Upsert incoming nodes
      for (const n of data.nodes) {
        const typeVersion = n.typeVersion ?? 1;
        const positionX = n.positionX ?? 0;
        const positionY = n.positionY ?? 0;
        const config = n.config ?? {};
        const settings = n.settings ?? {};

        await tx`
          INSERT INTO nodes (
            id, workflow_id, key, type, type_version, name,
            position_x, position_y, config, credential_id, settings, updated_at
          ) VALUES (
            ${n.id}, ${workflowId}, ${n.key}, ${n.type}, ${typeVersion}, ${n.name},
            ${positionX}, ${positionY},
            ${JSON.stringify(config)}::jsonb,
            ${n.credentialId ?? null},
            ${JSON.stringify(settings)}::jsonb,
            NOW()
          )
          ON CONFLICT (id) DO UPDATE
          SET key = EXCLUDED.key,
              type = EXCLUDED.type,
              type_version = EXCLUDED.type_version,
              name = EXCLUDED.name,
              position_x = EXCLUDED.position_x,
              position_y = EXCLUDED.position_y,
              config = EXCLUDED.config,
              credential_id = EXCLUDED.credential_id,
              settings = EXCLUDED.settings,
              updated_at = NOW()
        `;
      }
    }

    // 3. Synchronize connections if provided
    if (data.connections !== undefined) {
      await tx`DELETE FROM connections WHERE workflow_id = ${workflowId}`;
      for (const c of data.connections) {
        const sourcePort = c.sourcePort ?? 'main';
        const targetPort = c.targetPort ?? 'main';

        await tx`
          INSERT INTO connections (
            workflow_id, source_node_id, source_port, target_node_id, target_port
          ) VALUES (
            ${workflowId}, ${c.sourceNodeId}, ${sourcePort}, ${c.targetNodeId}, ${targetPort}
          )
          ON CONFLICT DO NOTHING
        `;
      }
    }

    // 4. Return complete graph
    const nodeRows = await tx`
      SELECT id, key, type, type_version, name, position_x, position_y, config, credential_id, settings
      FROM nodes
      WHERE workflow_id = ${workflowId}
      ORDER BY created_at ASC
    `;

    const connRows = await tx`
      SELECT id, source_node_id, source_port, target_node_id, target_port
      FROM connections
      WHERE workflow_id = ${workflowId}
    `;

    const nodes: WorkflowNode[] = nodeRows.map((n) => ({
      id: n.id as string,
      key: n.key as string,
      type: n.type as string,
      typeVersion: Number(n.type_version ?? 1),
      name: n.name as string,
      positionX: Number(n.position_x ?? 0),
      positionY: Number(n.position_y ?? 0),
      config: (typeof n.config === 'string' ? JSON.parse(n.config) : n.config) ?? {},
      credentialId: (n.credential_id as string) ?? null,
      settings: (typeof n.settings === 'string' ? JSON.parse(n.settings) : n.settings) ?? {},
    }));

    const connections: WorkflowConnection[] = connRows.map((c) => ({
      id: c.id as string,
      sourceNodeId: c.source_node_id as string,
      sourcePort: c.source_port as string,
      targetNodeId: c.target_node_id as string,
      targetPort: c.target_port as string,
    }));

    const wfParsed: Workflow = {
      id: updatedWf.id as string,
      projectId: updatedWf.project_id as string,
      name: updatedWf.name as string,
      description: (updatedWf.description as string) ?? '',
      status: updatedWf.status as 'draft' | 'active' | 'archived',
      activeVersionId: (updatedWf.active_version_id as string) ?? null,
      revision: Number(updatedWf.revision ?? 1),
      settings:
        (typeof updatedWf.settings === 'string'
          ? JSON.parse(updatedWf.settings)
          : updatedWf.settings) ?? {},
      createdBy: (updatedWf.created_by as string) ?? null,
      createdAt: String(updatedWf.created_at),
      updatedAt: String(updatedWf.updated_at),
    };

    return { workflow: wfParsed, nodes, connections };
  });
}
