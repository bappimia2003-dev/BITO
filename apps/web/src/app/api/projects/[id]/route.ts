import { z } from 'zod';
import { withRoute } from '../../../../server/http/withRoute.js';
import {
  findProjectById,
  updateProject,
  deleteProject,
} from '../../../../server/repositories/projects.js';
import { recordAuditLog } from '../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

export const GET = withRoute(
  {
    auth: true,
    role: 'viewer',
  },
  async ({ user, params }) => {
    const projectId = params.id as string;
    const project = await findProjectById({ userId: user!.id }, projectId);
    return { project };
  }
);

const updateProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(100),
});

export const PATCH = withRoute(
  {
    auth: true,
    role: 'editor',
    body: updateProjectSchema,
  },
  async ({ user, params, body, req }) => {
    const projectId = params.id as string;
    const project = await updateProject({ userId: user!.id }, projectId, { name: body.name });

    await recordAuditLog({
      userId: user!.id,
      projectId: project.id,
      action: 'project.update',
      targetType: 'project',
      targetId: project.id,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: { name: project.name },
    });

    return { project };
  }
);

export const DELETE = withRoute(
  {
    auth: true,
    role: 'owner',
    recentAuth: true,
  },
  async ({ user, params, req }) => {
    const projectId = params.id as string;
    // Record audit log before deletion
    await recordAuditLog({
      userId: user!.id,
      projectId,
      action: 'project.delete',
      targetType: 'project',
      targetId: projectId,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
    });

    await deleteProject({ userId: user!.id }, projectId);
    return { ok: true };
  }
);
