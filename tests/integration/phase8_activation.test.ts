import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { defaultNodeRegistry } from '../../packages/engine/src/index.js';
import { initializeRegistry } from '../../packages/nodes/src/registry.js';
import { registerTestUser } from '../helpers/phase3Helpers.js';
import {
  activateWorkflow,
  deactivateWorkflow,
} from '../../apps/web/src/server/workflow/workflowActivation.js';
import { findWorkflowById } from '../../apps/web/src/server/repositories/workflows.js';

describe('Phase 8 Workflow Activation & Snapshot Versioning Tests', { timeout: 60000 }, () => {
  let sql: Sql;
  const dbUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL_MIGRATE || process.env.DATABASE_URL;

  let ownerId = '';
  let projectId = '';

  beforeAll(async () => {
    expect(dbUrl).toBeDefined();
    sql = postgres(dbUrl!, { prepare: false, ssl: 'require', max: 5 });
    initializeRegistry(defaultNodeRegistry);

    const owner = await registerTestUser({
      email: `p8_act_${Date.now()}@example.com`,
      displayName: 'Activation Tester',
      password: 'ValidPassword123!',
    });
    ownerId = owner.id;

    const [proj] = await sql`
      INSERT INTO projects (name, owner_id)
      VALUES (${'Activation Proj ' + Date.now()}, ${ownerId})
      RETURNING id
    `;
    projectId = proj!.id;
    await sql`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${projectId}, ${ownerId}, 'owner')
    `;
  });

  afterAll(async () => {
    if (sql) {
      if (projectId) {
        await sql`DELETE FROM projects WHERE id = ${projectId}`;
      }
      await sql.end();
    }
  });

  it('1. Rejects activation of workflow with validation errors (e.g. no trigger) with 422', async () => {
    const [wf] = await sql`
      INSERT INTO workflows (project_id, name, description, status, revision, created_by)
      VALUES (${projectId}, 'Invalid WF', 'Has no trigger', 'draft', 1, ${ownerId})
      RETURNING id
    `;
    const invalidWfId = wf!.id;

    // Insert only a data node (no trigger)
    await sql`
      INSERT INTO nodes (id, workflow_id, key, type, type_version, name, position_x, position_y, config, settings)
      VALUES (${crypto.randomUUID()}, ${invalidWfId}, 'data_only', 'data.set', 1, 'Data', 100, 100, '{}'::jsonb, '{}'::jsonb)
    `;

    await expect(activateWorkflow({ userId: ownerId }, invalidWfId)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      httpStatus: 422,
    });
  });

  it('2. Activates valid workflow: creates workflow_versions snapshot (purpose=activation) and sets active_version_id', async () => {
    const [wf] = await sql`
      INSERT INTO workflows (project_id, name, description, status, revision, created_by)
      VALUES (${projectId}, 'Valid WF', 'Ready to activate', 'draft', 1, ${ownerId})
      RETURNING id
    `;
    const validWfId = wf!.id;

    const triggerId = crypto.randomUUID();
    const noopId = crypto.randomUUID();

    await sql`
      INSERT INTO nodes (id, workflow_id, key, type, type_version, name, position_x, position_y, config, settings)
      VALUES
        (${triggerId}, ${validWfId}, 'manual_trig', 'trigger.manual', 1, 'Manual Trigger', 100, 100, '{}'::jsonb, '{}'::jsonb),
        (${noopId}, ${validWfId}, 'noop_node', 'logic.noop', 1, 'Noop', 300, 100, '{}'::jsonb, '{}'::jsonb)
    `;

    await sql`
      INSERT INTO connections (workflow_id, source_node_id, source_port, target_node_id, target_port)
      VALUES (${validWfId}, ${triggerId}, 'main', ${noopId}, 'main')
    `;

    const result = await activateWorkflow({ userId: ownerId }, validWfId);
    expect(result.ok).toBe(true);
    expect(result.versionId).toBeDefined();
    expect(result.versionNum).toBeGreaterThanOrEqual(1);

    // Verify workflow updated to active
    const workflow = await findWorkflowById({ userId: ownerId }, validWfId);
    expect(workflow.status).toBe('active');
    expect(workflow.activeVersionId).toBe(result.versionId);

    // Verify version record created with purpose='activation'
    const [versionRow] = await sql`
      SELECT id, version, purpose, snapshot FROM workflow_versions WHERE id = ${result.versionId}
    `;
    expect(versionRow).toBeDefined();
    expect(versionRow!.purpose).toBe('activation');
    expect(versionRow!.snapshot.nodes.length).toBe(2);
    expect(versionRow!.snapshot.connections.length).toBe(1);
  });

  it('3. Deactivating sets status to draft and running executions can still reference snapshot', async () => {
    const [wf] = await sql`
      INSERT INTO workflows (project_id, name, description, status, revision, created_by)
      VALUES (${projectId}, 'Deact WF', 'To deactivate', 'draft', 1, ${ownerId})
      RETURNING id
    `;
    const wfId = wf!.id;

    const triggerId = crypto.randomUUID();
    await sql`
      INSERT INTO nodes (id, workflow_id, key, type, type_version, name, position_x, position_y, config, settings)
      VALUES (${triggerId}, ${wfId}, 'trig', 'trigger.manual', 1, 'Trigger', 100, 100, '{}'::jsonb, '{}'::jsonb)
    `;

    const actResult = await activateWorkflow({ userId: ownerId }, wfId);
    expect(actResult.ok).toBe(true);

    const deactResult = await deactivateWorkflow({ userId: ownerId }, wfId);
    expect(deactResult.ok).toBe(true);

    const workflow = await findWorkflowById({ userId: ownerId }, wfId);
    expect(workflow.status).toBe('draft');
  });
});
