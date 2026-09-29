import { BitoError } from '@bito/shared';
import { withRoute } from '../../../../../server/http/withRoute.js';
import { assertProjectRole } from '../../../../../server/auth/rbac.js';
import { PostgresExecutionStore } from '../../../../../server/engine-runtime/postgresExecutionStore.js';
import { retryExecution } from '../../../../../server/engine-runtime/retryExecution.js';

export const POST = withRoute({ auth: true }, async ({ user, params }) => {
  if (!user) throw BitoError('UNAUTHORIZED', 'Authentication required', { httpStatus: 401 });
  const executionId = params['id'];
  if (!executionId) throw BitoError('VALIDATION_FAILED', 'Execution ID required');

  const store = new PostgresExecutionStore();
  const exec = await store.loadExecution(executionId);
  await assertProjectRole({ userId: user.id }, exec.projectId, 'editor');

  const newExecutionId = await retryExecution(executionId);
  return { ok: true, retryOf: executionId, newExecutionId };
});
