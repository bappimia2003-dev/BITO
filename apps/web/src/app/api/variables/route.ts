import { z } from 'zod';
import { withRoute } from '../../../server/http/withRoute.js';
import { listVariables, createVariable } from '../../../server/repositories/variables.js';
import { BitoError } from '@bito/shared';

export const runtime = 'nodejs';

const listQuerySchema = z.object({
  scope: z.enum(['global', 'project', 'workflow']),
  projectId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
});

const createVariableSchema = z.object({
  scope: z.enum(['global', 'project', 'workflow']),
  key: z.string().min(1),
  value: z.unknown(),
  projectId: z.string().uuid().optional(),
  workflowId: z.string().uuid().optional(),
});

export const GET = withRoute({ auth: true }, async ({ user, req }) => {
  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    scope: url.searchParams.get('scope'),
    projectId: url.searchParams.get('projectId') || undefined,
    workflowId: url.searchParams.get('workflowId') || undefined,
  });

  if (!parsed.success) {
    throw BitoError('VALIDATION_FAILED', 'Invalid variable query parameters', {
      httpStatus: 400,
      details: { errors: parsed.error.format() },
    });
  }

  const variables = await listVariables({ userId: user!.id }, parsed.data);
  return { variables };
});

export const POST = withRoute(
  {
    auth: true,
    body: createVariableSchema,
  },
  async ({ user, body }) => {
    const variable = await createVariable(
      { userId: user!.id },
      {
        scope: body.scope,
        key: body.key,
        value: body.value,
        projectId: body.projectId,
        workflowId: body.workflowId,
      }
    );

    return { variable };
  }
);
