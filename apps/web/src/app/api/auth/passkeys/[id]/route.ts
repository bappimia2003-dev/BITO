import { NextResponse } from 'next/server.js';
import { BitoError } from '@bito/shared';
import { withRoute } from '../../../../../server/http/withRoute.js';
import {
  deleteCredentialById,
  countCredentialsForUser,
} from '../../../../../server/repositories/webauthn.js';
import { recordAuditLog } from '../../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

export const DELETE = withRoute(
  {
    auth: true,
    recentAuth: true,
  },
  async ({ params, user, req }) => {
    if (!user) {
      throw BitoError('UNAUTHORIZED', 'Authentication required', { httpStatus: 401 });
    }

    const passkeyId = params.id;
    if (!passkeyId) {
      throw BitoError('VALIDATION_FAILED', 'Passkey ID is required', { httpStatus: 400 });
    }

    // SPEC Section 14.1: "cannot remove the last login method"
    const passkeyCount = await countCredentialsForUser(user.id);
    const hasPassword = Boolean(user.passwordHash);

    if (!hasPassword && passkeyCount <= 1) {
      throw BitoError(
        'BAD_REQUEST',
        'Cannot remove the last login method. Please set a password or add another passkey first.',
        { httpStatus: 400 }
      );
    }

    const deleted = await deleteCredentialById(passkeyId, user.id);
    if (!deleted) {
      throw BitoError('NOT_FOUND', 'Passkey not found', { httpStatus: 404 });
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    await recordAuditLog({
      userId: user.id,
      action: 'passkey.delete',
      targetType: 'webauthn_credential',
      targetId: passkeyId,
      ip,
      userAgent,
    });

    return NextResponse.json({ success: true, message: 'Passkey removed successfully' });
  }
);
