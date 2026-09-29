import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import { BitoError } from '@bito/shared';
import { withRoute } from '../../../../server/http/withRoute.js';
import { env } from '../../../../server/env.js';
import { createUser, findUserByEmail, countUsers } from '../../../../server/repositories/users.js';
import { createSession } from '../../../../server/repositories/sessions.js';
import { validatePasswordStrength, hashPassword } from '../../../../server/auth/passwords.js';
import { buildSessionCookie, serializeCookieHeader } from '../../../../server/auth/cookies.js';
import { recordAuditLog } from '../../../../server/repositories/audit.js';

const registerSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1, 'Display name is required').max(100),
  password: z.string(),
});

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    body: registerSchema,
    rateLimit: ({ req }) => {
      const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        '127.0.0.1';
      return { key: `register:${ip}`, limit: 10, windowSec: 3600 }; // 10/hour
    },
  },
  async ({ body, req }) => {
    // 1. Check ALLOW_REGISTRATION setting
    if (!env.ALLOW_REGISTRATION) {
      const totalUsers = await countUsers();
      if (totalUsers > 0) {
        throw BitoError('FORBIDDEN', 'Registration is disabled', { httpStatus: 403 });
      }
    }

    // 2. Validate password strength and common passwords
    validatePasswordStrength(body.password);

    // 3. Check for existing user
    const existing = await findUserByEmail(body.email);
    if (existing) {
      throw BitoError('CONFLICT', 'A user with this email already exists', {
        httpStatus: 409,
      });
    }

    // 4. Hash password with argon2id
    const passwordHash = await hashPassword(body.password);

    // 5. Create user
    const user = await createUser({
      email: body.email,
      displayName: body.displayName,
      passwordHash,
    });

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    // 6. Create initial session
    const { session, rawToken } = await createSession({
      userId: user.id,
      ip,
      userAgent,
    });

    // 7. Audit log
    await recordAuditLog({
      userId: user.id,
      action: 'auth.register',
      targetType: 'user',
      targetId: user.id,
      ip,
      userAgent,
      meta: { method: 'password' },
    });

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
