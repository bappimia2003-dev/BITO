import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { getDb } from '../db/client.js';
import { assertProjectRole, type Actor } from '../auth/rbac.js';
import { parseRow } from './base.js';

export const projectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  ownerId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  role: z.enum(['owner', 'editor', 'viewer']).optional(),
});

export type Project = z.infer<typeof projectSchema>;

export const projectMemberSchema = z.object({
  projectId: z.string().uuid(),
  userId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(['owner', 'editor', 'viewer']),
});

export type ProjectMember = z.infer<typeof projectMemberSchema>;

export async function findProjectById(actor: Actor, projectId: string): Promise<Project> {
  const { role } = await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const rows = await sql`
    SELECT id, name, owner_id, created_at, updated_at
    FROM projects
    WHERE id = ${projectId}
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) {
    throw BitoError('NOT_FOUND', 'Project not found', { httpStatus: 404 });
  }
  const project = parseRow(projectSchema, row);
  return { ...project, role };
}

export async function listProjectsForUser(actor: Actor): Promise<Project[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT p.id, p.name, p.owner_id, p.created_at, p.updated_at, pm.role
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
    if (!projectRow)
      throw BitoError('INTERNAL_ERROR', 'Failed to create project', { httpStatus: 500 });
    const project = parseRow(projectSchema, projectRow);

    await tx`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES (${project.id}, ${actor.userId}, 'owner')
    `;

    return { ...project, role: 'owner' as const };
  });
}

export async function updateProject(
  actor: Actor,
  projectId: string,
  data: { name: string }
): Promise<Project> {
  const { role } = await assertProjectRole(actor, projectId, 'editor');
  const sql = getDb();
  const rows = await sql`
    UPDATE projects
    SET name = ${data.name}, updated_at = NOW()
    WHERE id = ${projectId}
    RETURNING id, name, owner_id, created_at, updated_at
  `;
  const row = rows[0];
  if (!row) throw BitoError('NOT_FOUND', 'Project not found', { httpStatus: 404 });
  const project = parseRow(projectSchema, row);
  return { ...project, role };
}

export async function deleteProject(actor: Actor, projectId: string): Promise<void> {
  await assertProjectRole(actor, projectId, 'owner');
  const sql = getDb();
  await sql`
    DELETE FROM projects
    WHERE id = ${projectId}
  `;
}

export async function listProjectMembers(
  actor: Actor,
  projectId: string
): Promise<ProjectMember[]> {
  await assertProjectRole(actor, projectId, 'viewer');
  const sql = getDb();
  const rows = await sql`
    SELECT pm.project_id, pm.user_id, u.email, pm.role
    FROM project_members pm
    INNER JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ${projectId}
    ORDER BY 
      CASE pm.role 
        WHEN 'owner' THEN 1 
        WHEN 'editor' THEN 2 
        WHEN 'viewer' THEN 3 
      END ASC,
      u.email ASC
  `;
  return rows.map((r) => parseRow(projectMemberSchema, r));
}

export async function addProjectMember(
  actor: Actor,
  projectId: string,
  data: { email: string; role: 'editor' | 'viewer' }
): Promise<ProjectMember> {
  await assertProjectRole(actor, projectId, 'owner');
  const sql = getDb();

  // Find user by email
  const userRows = await sql`
    SELECT id, email
    FROM users
    WHERE email = ${data.email}
    LIMIT 1
  `;
  const user = userRows[0];
  if (!user) {
    throw BitoError('NOT_FOUND', `User with email ${data.email} not found`, { httpStatus: 404 });
  }

  // Check if user is already a member
  const existingRows = await sql`
    SELECT role FROM project_members
    WHERE project_id = ${projectId} AND user_id = ${user.id}
    LIMIT 1
  `;
  if (existingRows.length > 0) {
    throw BitoError('CONFLICT', 'User is already a member of this project', { httpStatus: 409 });
  }

  await sql`
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (${projectId}, ${user.id}, ${data.role})
  `;

  return {
    projectId,
    userId: user.id as string,
    email: user.email as string,
    role: data.role,
  };
}

export async function updateProjectMemberRole(
  actor: Actor,
  projectId: string,
  targetUserId: string,
  newRole: 'owner' | 'editor' | 'viewer'
): Promise<ProjectMember> {
  await assertProjectRole(actor, projectId, 'owner');
  const sql = getDb();

  // Check current role
  const currentRows = await sql`
    SELECT pm.role, u.email
    FROM project_members pm
    INNER JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ${projectId} AND pm.user_id = ${targetUserId}
    LIMIT 1
  `;
  const current = currentRows[0];
  if (!current) {
    throw BitoError('NOT_FOUND', 'Project member not found', { httpStatus: 404 });
  }

  // If demoting an owner, verify there is at least one other owner
  if (current.role === 'owner' && newRole !== 'owner') {
    const ownerCountRows = await sql`
      SELECT COUNT(*)::int as count
      FROM project_members
      WHERE project_id = ${projectId} AND role = 'owner'
    `;
    if ((ownerCountRows[0]?.count ?? 0) <= 1) {
      throw BitoError('BAD_REQUEST', 'Cannot demote the sole owner of the project', {
        httpStatus: 400,
      });
    }
  }

  await sql`
    UPDATE project_members
    SET role = ${newRole}
    WHERE project_id = ${projectId} AND user_id = ${targetUserId}
  `;

  return {
    projectId,
    userId: targetUserId,
    email: current.email as string,
    role: newRole,
  };
}

export async function removeProjectMember(
  actor: Actor,
  projectId: string,
  targetUserId: string
): Promise<void> {
  // Can remove if actor is owner, OR if actor is removing themselves
  if (actor.userId !== targetUserId) {
    await assertProjectRole(actor, projectId, 'owner');
  } else {
    await assertProjectRole(actor, projectId, 'viewer');
  }

  const sql = getDb();

  // Check if target is sole owner
  const currentRows = await sql`
    SELECT role
    FROM project_members
    WHERE project_id = ${projectId} AND user_id = ${targetUserId}
    LIMIT 1
  `;
  const current = currentRows[0];
  if (!current) {
    throw BitoError('NOT_FOUND', 'Project member not found', { httpStatus: 404 });
  }

  if (current.role === 'owner') {
    const ownerCountRows = await sql`
      SELECT COUNT(*)::int as count
      FROM project_members
      WHERE project_id = ${projectId} AND role = 'owner'
    `;
    if ((ownerCountRows[0]?.count ?? 0) <= 1) {
      throw BitoError('BAD_REQUEST', 'Cannot remove the sole owner of the project', {
        httpStatus: 400,
      });
    }
  }

  await sql`
    DELETE FROM project_members
    WHERE project_id = ${projectId} AND user_id = ${targetUserId}
  `;
}
