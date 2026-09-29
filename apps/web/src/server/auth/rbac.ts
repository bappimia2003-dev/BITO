import { BitoError, type ProjectRole } from '@bito/shared';
import { getDb } from '../db/client.js';

export interface Actor {
  userId: string;
}

const ROLE_RANK: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export async function assertProjectRole(
  actor: Actor,
  projectId: string,
  minRole: ProjectRole = 'viewer'
): Promise<{ role: ProjectRole }> {
  const sql = getDb();

  const members = await sql<{ role: ProjectRole }[]>`
    SELECT role FROM project_members
    WHERE project_id = ${projectId} AND user_id = ${actor.userId}
    LIMIT 1
  `;

  const member = members[0];
  if (!member) {
    throw BitoError('FORBIDDEN', 'Access denied to project', {
      httpStatus: 403,
      details: { projectId, userId: actor.userId },
    });
  }

  const userRank = ROLE_RANK[member.role] ?? 0;
  const requiredRank = ROLE_RANK[minRole] ?? 1;

  if (userRank < requiredRank) {
    throw BitoError(
      'FORBIDDEN',
      `Insufficient project permissions. Required: ${minRole}, current: ${member.role}`,
      {
        httpStatus: 403,
        details: { projectId, currentRole: member.role, requiredRole: minRole },
      }
    );
  }

  return { role: member.role };
}
