import { z } from 'zod';
import { withRoute } from '../../../../server/http/withRoute.js';
import { updateVariable, deleteVariable } from '../../../../server/repositories/variables.js';
import { BitoError } from '@bito/shared';

export const runtime = 'nodejs';

const patchVariableBodySchema = z.object({
  key: z.string().min(1).optional(),
  value: z.unknown().optional(),
});

export const PATCH = withRoute(
  {
    auth: true,
    body: patchVariableBodySchema,
  },
  async ({ user, params, body }) => {
    const id = params?.id;
    if (!id) throw BitoError('VALIDATION_FAILED', 'Variable id is required', { httpStatus: 400 });

    if (body.key === undefined && body.value === undefined) {
      throw BitoError('VALIDATION_FAILED', 'Either key or value must be provided to update', {
        httpStatus: 400,
      });
    }

    const variable = await updateVariable({ userId: user!.id }, id, {
      key: body.key,
      value: body.value,
    });

    return { variable };
  }
);

export const DELETE = withRoute({ auth: true }, async ({ user, params }) => {
  const id = params?.id;
  if (!id) throw BitoError('VALIDATION_FAILED', 'Variable id is required', { httpStatus: 400 });

  await deleteVariable({ userId: user!.id }, id);
  return { ok: true };
});
