import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { withRoute } from '../../../../server/http/withRoute.js';
import { findUserByEmail } from '../../../../server/repositories/users.js';
import { createSession } from '../../../../server/repositories/sessions.js';
import { verifyPassword, dummyVerifyPassword } from '../../../../server/auth/passwords.js';
import {
  assertLoginNotThrottled,
  recordFailedLogin,
  clearFailedLogins,
} from '../../../../server/auth/throttle.js';
import { buildSessionCookie, serializeCookieHeader } from '../../../../server/auth/cookies.js';
import { recordAuditLog } from '../../../../server/repositories/audit.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    body: loginSchema,
  },
  async ({ body, req }) => {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    // 1. Check throttling (5 failed attempts per (email, IP) per 15 min)
    await assertLoginNotThrottled(body.email, ip);

    // 2. Look up user
    const user = await findUserByEmail(body.email);

    if (!user || user.isDisabled || !user.passwordHash) {
      // Dummy hash for timing equalization to prevent user enumeration
      await dummyVerifyPassword(body.password);
      await recordFailedLogin(body.email, ip, userAgent);
      throw BitoError('UNAUTHORIZED', 'Invalid email or password', { httpStatus: 401 });
    }

    // 3. Verify password
    const isValid = await verifyPassword(user.passwordHash, body.password);
    if (!isValid) {
      await recordFailedLogin(body.email, ip, userAgent);
      throw BitoError('UNAUTHORIZED', 'Invalid email or password', { httpStatus: 401 });
    }

    // 4. Reset failed login counter on success
    await clearFailedLogins(body.email, ip);

    // 5. Create new session
    const { session, rawToken } = await createSession({
      userId: user.id,
      ip,
      userAgent,
    });

    // 6. Record audit log
    await recordAuditLog({
      userId: user.id,
      action: 'auth.login',
      targetType: 'session',
      targetId: session.id,
      ip,
      userAgent,
      meta: { method: 'password' },
    });

    const res = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
      },
      success: true,
    });

    res.headers.set('Set-Cookie', serializeCookieHeader(buildSessionCookie(rawToken)));
    return res;
  }
);
