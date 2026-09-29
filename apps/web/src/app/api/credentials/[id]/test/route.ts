import { withRoute } from '../../../../../server/http/withRoute.js';
import {
  findCredentialSummaryById,
  getDecryptedCredentialPayload,
} from '../../../../../server/repositories/credentials.js';
import { testCredentialConnection } from '../../../../../server/services/credentialTesters.js';
import { assertRateLimit } from '../../../../../server/security/rateLimit.js';
import { recordAuditLog } from '../../../../../server/repositories/audit.js';
import { BitoError } from '@bito/shared';

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    auth: true,
    recentAuth: true,
  },
  async ({ user, params, req }) => {
    const id = params?.id;
    if (!id) throw BitoError('VALIDATION_FAILED', 'Credential id is required', { httpStatus: 400 });

    // Assert access to credential and its project
    const summary = await findCredentialSummaryById({ userId: user!.id }, id);

    // Rate limit: 10 per minute per user/credential (SPEC Section 13.3)
    await assertRateLimit(`cred_test:${id}`, 10, 60);

    // Decrypt secretly on server
    const secretRecord = await getDecryptedCredentialPayload(id);

    // Run connection test
    const result = await testCredentialConnection(secretRecord.type, secretRecord.data);

    // Audit the test action (NO secrets in audit log!)
    await recordAuditLog({
      userId: user!.id,
      projectId: summary.projectId,
      action: 'credential.test',
      targetType: 'credential',
      targetId: id,
      ip: req.headers.get('x-forwarded-for') || null,
      userAgent: req.headers.get('user-agent') || null,
      meta: {
        name: summary.name,
        type: summary.type,
        ok: result.ok,
      },
    });

    return {
      ok: result.ok,
      message: result.message,
    };
  }
);
