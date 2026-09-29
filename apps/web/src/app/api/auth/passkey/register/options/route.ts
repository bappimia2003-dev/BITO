import { NextResponse } from 'next/server.js';
import { z } from 'zod';
import { withRoute } from '../../../../../../server/http/withRoute.js';
import { createPasskeyRegistrationOptions } from '../../../../../../server/auth/webauthnService.js';

const registerOptionsSchema = z.object({
  email: z.string().email().optional(),
  displayName: z.string().min(1).optional(),
});

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    body: registerOptionsSchema,
    rateLimit: ({ req }) => {
      const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        '127.0.0.1';
      return { key: `passkey_options:${ip}`, limit: 30, windowSec: 60 };
    },
  },
  async ({ body, user }) => {
    const options = await createPasskeyRegistrationOptions({
      user,
      pendingEmail: body.email,
      pendingDisplayName: body.displayName,
    });

    return NextResponse.json(options);
  }
);
