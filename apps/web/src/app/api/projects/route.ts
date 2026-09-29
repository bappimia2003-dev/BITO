import { z } from 'zod';
import { withRoute } from '../../../server/http/withRoute.js';
import { listProjectsForUser, createProject } from '../../../server/repositories/projects.js';
import { recordAuditLog } from '../../../server/repositories/audit.js';

export const runtime = 'nodejs';

export const GET = withRoute({ auth: true }, async ({ user }) => {
  const projects = await listProjectsForUser({ userId: user!.id });
  return { projects };
});

const createProjectSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(100),
});

export const POST = withRoute(
  {
    auth: true,
    body: createProjectSchema,
  },
  async ({ user, body, req }) => {
    const project = await createProject({ userId: user!.id }, body.name);

    await recordAuditLog({
      userId: user!.id,
      projectId: project.id,
      action: 'project.create',
      targetType: 'project',
      targetId: project.id,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: { name: project.name },
    });

    return { project };
  }
);
