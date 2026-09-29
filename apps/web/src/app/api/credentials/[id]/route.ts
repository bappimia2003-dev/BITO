import { z } from 'zod';
import { withRoute } from '../../../../server/http/withRoute.js';
import {
  findCredentialSummaryById,
  replaceCredentialSecret,
  updateCredentialName,
  deleteCredential,
} from '../../../../server/repositories/credentials.js';
import { BitoError } from '@bito/shared';

export const runtime = 'nodejs';

const patchCredentialBodySchema = z.object({
  name: z.string().min(1).optional(),
  data: z.record(z.unknown()).optional(),
});

export const GET = withRoute({ auth: true }, async ({ user, params }) => {
  const id = params?.id;
  if (!id) throw BitoError('VALIDATION_FAILED', 'Credential id is required', { httpStatus: 400 });

  const credential = await findCredentialSummaryById({ userId: user!.id }, id);
  return { credential };
});

export const PATCH = withRoute(
  {
    auth: true,
    recentAuth: true,
    body: patchCredentialBodySchema,
  },
  async ({ user, params, body }) => {
    const id = params?.id;
    if (!id) throw BitoError('VALIDATION_FAILED', 'Credential id is required', { httpStatus: 400 });

    if (!body.name && !body.data) {
      throw BitoError('VALIDATION_FAILED', 'Either name or data must be provided to update', {
        httpStatus: 400,
      });
    }

    let updated = await findCredentialSummaryById({ userId: user!.id }, id);

    if (body.data) {
      updated = await replaceCredentialSecret({ userId: user!.id }, id, { data: body.data });
    }

    if (body.name && body.name !== updated.name) {
      updated = await updateCredentialName({ userId: user!.id }, id, body.name);
    }

    return { credential: updated };
  }
);

export const DELETE = withRoute(
  {
    auth: true,
    recentAuth: true,
  },
  async ({ user, params }) => {
    const id = params?.id;
    if (!id) throw BitoError('VALIDATION_FAILED', 'Credential id is required', { httpStatus: 400 });

    await deleteCredential({ userId: user!.id }, id);
    return { ok: true };
  }
);
