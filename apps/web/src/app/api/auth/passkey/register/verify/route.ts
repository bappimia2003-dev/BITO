import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import { withRoute } from '../../../../../../server/http/withRoute.js';
import { verifyPasskeyRegistration } from '../../../../../../server/auth/webauthnService.js';
import {
  buildSessionCookie,
  serializeCookieHeader,
} from '../../../../../../server/auth/cookies.js';

const registerVerifySchema = z.object({
  response: z.record(z.unknown()),
  challenge: z.string().min(1),
  deviceName: z.string().optional(),
});

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    body: registerVerifySchema,
  },
  async ({ body, req }) => {
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    const result = await verifyPasskeyRegistration({
      response: body.response as unknown as RegistrationResponseJSON,
      challenge: body.challenge,
      deviceName: body.deviceName,
      ip,
      userAgent,
    });

    const res = NextResponse.json({
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
      },
      verified: true,
      isNewUser: result.isNewUser,
    });

    if (result.rawToken) {
      res.headers.set('Set-Cookie', serializeCookieHeader(buildSessionCookie(result.rawToken)));
    }

    return res;
  }
);
