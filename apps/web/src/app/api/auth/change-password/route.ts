import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { withRoute } from '../../../../server/http/withRoute.js';
import { updateUserPassword } from '../../../../server/repositories/users.js';
import { validatePasswordStrength, hashPassword } from '../../../../server/auth/passwords.js';
import { recordAuditLog } from '../../../../server/repositories/audit.js';

const changePasswordSchema = z.object({
  newPassword: z.string(),
});

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    auth: true,
    recentAuth: true,
    body: changePasswordSchema,
  },
  async ({ body, user, req }) => {
    if (!user) {
      throw BitoError('UNAUTHORIZED', 'Authentication required', { httpStatus: 401 });
    }

    validatePasswordStrength(body.newPassword);

    const passwordHash = await hashPassword(body.newPassword);
    await updateUserPassword(user.id, passwordHash);

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    await recordAuditLog({
      userId: user.id,
      action: 'password.change',
      targetType: 'user',
      targetId: user.id,
      ip,
      userAgent,
    });

    return NextResponse.json({ success: true, message: 'Password updated successfully' });
  }
);
