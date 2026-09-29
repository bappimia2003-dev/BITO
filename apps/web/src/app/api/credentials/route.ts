import { z } from 'zod';
import { withRoute } from '../../../server/http/withRoute.js';
import { listCredentials, createCredential } from '../../../server/repositories/credentials.js';
import {
  CREDENTIAL_TYPES,
  type CredentialType,
} from '../../../server/repositories/credentialSchemas.js';
import { BitoError } from '@bito/shared';

export const runtime = 'nodejs';

const listQuerySchema = z.object({
  projectId: z.string().uuid('Valid projectId is required'),
});

const createCredentialBodySchema = z.object({
  projectId: z.string().uuid('Valid projectId is required'),
  name: z.string().min(1, 'Credential name is required'),
  type: z.enum(CREDENTIAL_TYPES),
  data: z.record(z.unknown()),
});

export const GET = withRoute({ auth: true }, async ({ user, req }) => {
  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    projectId: url.searchParams.get('projectId'),
  });

  if (!parsed.success) {
    throw BitoError('VALIDATION_FAILED', 'projectId query parameter is required', {
      httpStatus: 400,
    });
  }

  const credentials = await listCredentials({ userId: user!.id }, parsed.data.projectId);
  return { credentials };
});

export const POST = withRoute(
  {
    auth: true,
    recentAuth: true,
    body: createCredentialBodySchema,
  },
  async ({ user, body }) => {
    const credential = await createCredential({ userId: user!.id }, body.projectId, {
      name: body.name,
      type: body.type as CredentialType,
      data: body.data,
    });

    return { credential };
  }
);
