import { z } from 'zod';
import { withRoute } from '../../../../../server/http/withRoute.js';
import {
  listProjectMembers,
  addProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
} from '../../../../../server/repositories/projects.js';
import { recordAuditLog } from '../../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

export const GET = withRoute(
  {
    auth: true,
    role: 'viewer',
  },
  async ({ user, params }) => {
    const projectId = params.id as string;
    const members = await listProjectMembers({ userId: user!.id }, projectId);
    return { members };
  }
);

const addMemberSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(['editor', 'viewer']),
});

export const POST = withRoute(
  {
    auth: true,
    role: 'owner',
    body: addMemberSchema,
  },
  async ({ user, params, body, req }) => {
    const projectId = params.id as string;
    const member = await addProjectMember({ userId: user!.id }, projectId, body);

    await recordAuditLog({
      userId: user!.id,
      projectId,
      action: 'project.member_add',
      targetType: 'user',
      targetId: member.userId,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: { email: member.email, role: member.role },
    });

    return { member };
  }
);

const updateMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['owner', 'editor', 'viewer']),
});

export const PATCH = withRoute(
  {
    auth: true,
    role: 'owner',
    body: updateMemberSchema,
  },
  async ({ user, params, body, req }) => {
    const projectId = params.id as string;
    const member = await updateProjectMemberRole(
      { userId: user!.id },
      projectId,
      body.userId,
      body.role
    );

    await recordAuditLog({
      userId: user!.id,
      projectId,
      action: 'project.member_update',
      targetType: 'user',
      targetId: member.userId,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: { email: member.email, role: member.role },
    });

    return { member };
  }
);

const removeMemberSchema = z.object({
  userId: z.string().uuid(),
});

export const DELETE = withRoute(
  {
    auth: true,
    recentAuth: true,
    body: removeMemberSchema,
  },
  async ({ user, params, body, req }) => {
    const projectId = params.id as string;
    await removeProjectMember({ userId: user!.id }, projectId, body.userId);

    await recordAuditLog({
      userId: user!.id,
      projectId,
      action: 'project.member_remove',
      targetType: 'user',
      targetId: body.userId,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: { removedUserId: body.userId },
    });

    return { ok: true };
  }
);
