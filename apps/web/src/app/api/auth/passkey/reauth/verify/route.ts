import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import { BitoError } from '@bito/shared';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { withRoute } from '../../../../../../server/http/withRoute.js';
import { verifyPasskeyReauth } from '../../../../../../server/auth/webauthnService.js';
import { updateSessionLastAuth } from '../../../../../../server/repositories/sessions.js';

const reauthVerifySchema = z.object({
  response: z.record(z.unknown()),
  challenge: z.string().min(1),
});

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    auth: true,
    body: reauthVerifySchema,
  },
  async ({ body, user, session, req }) => {
    if (!user || !session) {
      throw BitoError('UNAUTHORIZED', 'Authentication required', { httpStatus: 401 });
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    await verifyPasskeyReauth({
      userId: user.id,
      sessionId: session.id,
      response: body.response as unknown as AuthenticationResponseJSON,
      challenge: body.challenge,
      ip,
      userAgent,
    });

    await updateSessionLastAuth(session.id);

    return NextResponse.json({ success: true, reauthenticated: true });
  }
);
