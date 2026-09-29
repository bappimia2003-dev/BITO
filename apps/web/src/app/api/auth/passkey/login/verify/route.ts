import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { withRoute } from '../../../../../../server/http/withRoute.js';
import { verifyPasskeyLogin } from '../../../../../../server/auth/webauthnService.js';
import {
  buildSessionCookie,
  serializeCookieHeader,
} from '../../../../../../server/auth/cookies.js';

const loginVerifySchema = z.object({
  response: z.record(z.unknown()),
  challenge: z.string().min(1),
});

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    body: loginVerifySchema,
  },
  async ({ body, req }) => {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await verifyPasskeyLogin({
      response: body.response as unknown as AuthenticationResponseJSON,
      challenge: body.challenge,
      ip,
      userAgent,
    });

    const res = NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
      },
      success: true,
    });

    res.headers.set('Set-Cookie', serializeCookieHeader(buildSessionCookie(result.rawToken)));
    return res;
  }
);
