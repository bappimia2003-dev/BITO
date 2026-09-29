import { z } from 'zod';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  ownerId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Project = z.infer<typeof projectSchema>;

export async function findProjectById(actor: Actor, projectId: string): Promise<Project> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const rows = await sql`
    SELECT id, name, owner_id, created_at, updated_at
    FROM projects
    WHERE id = ${projectId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) throw new Error('Project not found');
  return parseRow(projectSchema, row);
}

export async function listProjectsForUser(actor: Actor): Promise<Project[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT p.id, p.name, p.owner_id, p.created_at, p.updated_at
    FROM projects p
    INNER JOIN project_members pm ON pm.project_id = p.id
    WHERE pm.user_id = ${actor.userId}
    ORDER BY p.created_at DESC
  `;
  return rows.map((r) => parseRow(projectSchema, r));
}

export async function createProject(actor: Actor, name: string): Promise<Project> {
  const sql = getDb();
  return await sql.begin(async (tx) => {
    const projectRows = await tx`
      INSERT INTO projects (name, owner_id)
      VALUES (${name}, ${actor.userId})
      RETURNING id, name, owner_id, created_at, updated_at
    `;
    const projectRow = projectRows[0];
    if (!projectRow) throw new Error('Failed to create project');
    const project = parseRow(projectSchema, projectRow);

    await tx`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${project.id}, ${actor.userId}, 'owner')
    `;

    return project;
  });
}

export async function deleteProject(actor: Actor, projectId: string): Promise<void> {
  await assertProjectRole(actor, projectId, 'owner');
  const sql = getDb();
  await sql`
    DELETE FROM projects
    WHERE id = ${projectId}
  `;
}
