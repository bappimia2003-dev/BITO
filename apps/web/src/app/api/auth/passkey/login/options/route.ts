import { NextResponse } from 'next/server.js';
import { withRoute } from '../../../../../../server/http/withRoute.js';
import { createPasskeyLoginOptions } from '../../../../../../server/auth/webauthnService.js';

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    rateLimit: ({ req }) => {
      const ip =
        req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
        req.headers.get('x-real-ip') ||
        '127.0.0.1';
      return { key: `passkey_login_options:${ip}`, limit: 30, windowSec: 60 };
    },
  },
  async () => {
    const options = await createPasskeyLoginOptions();
    return NextResponse.json(options);
  }
);
