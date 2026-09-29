import { withRoute } from '../../../../../server/http/withRoute.js';
import { getCredentialDependencies } from '../../../../../server/repositories/credentials.js';
import { BitoError } from '@bito/shared';

export const runtime = 'nodejs';

export const GET = withRoute({ auth: true }, async ({ user, params }) => {
  const id = params?.id;
  if (!id) throw BitoError('VALIDATION_FAILED', 'Credential id is required', { httpStatus: 400 });

  const dependents = await getCredentialDependencies({ userId: user!.id }, id);
  return { dependents };
});
