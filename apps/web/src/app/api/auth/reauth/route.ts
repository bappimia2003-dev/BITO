import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { withRoute } from '../../../../server/http/withRoute.js';
import { verifyPassword } from '../../../../server/auth/passwords.js';
import { updateSessionLastAuth } from '../../../../server/repositories/sessions.js';
import { recordAuditLog } from '../../../../server/repositories/audit.js';

const reauthSchema = z.object({
  password: z.string().min(1),
});

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    auth: true,
    body: reauthSchema,
  },
  async ({ body, user, session, req }) => {
    if (!user || !session) {
      throw BitoError('UNAUTHORIZED', 'Authentication required', { httpStatus: 401 });
    }

    if (!user.passwordHash) {
      throw BitoError(
        'BAD_REQUEST',
        'This account does not have a password configured. Please re-authenticate with a passkey.',
        { httpStatus: 400 }
      );
    }

    const isValid = await verifyPassword(user.passwordHash, body.password);
    if (!isValid) {
      throw BitoError('UNAUTHORIZED', 'Invalid password', { httpStatus: 401 });
    }

    await updateSessionLastAuth(session.id);

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    await recordAuditLog({
      userId: user.id,
      action: 'auth.reauth',
      targetType: 'session',
      targetId: session.id,
      ip,
      userAgent,
      meta: { method: 'password' },
    });

    return NextResponse.json({ success: true, reauthenticated: true });
  }
);
