import { NextResponse } from 'next/server.js';
import { withRoute } from '../../../../server/http/withRoute.js';
import { revokeSessionByToken } from '../../../../server/repositories/sessions.js';
import {
  extractSessionToken,
  buildSessionClearCookie,
  serializeCookieHeader,
} from '../../../../server/auth/cookies.js';
import { recordAuditLog } from '../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    auth: true,
  },
  async ({ user, session, req }) => {
    const token = extractSessionToken(req.headers);
    if (token) {
      await revokeSessionByToken(token);
    }

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    if (user && session) {
      await recordAuditLog({
        userId: user.id,
        action: 'auth.logout',
        targetType: 'session',
        targetId: session.id,
        ip,
        userAgent,
      });
    }

    const res = NextResponse.json({ success: true });
    res.headers.set('Set-Cookie', serializeCookieHeader(buildSessionClearCookie()));
    return res;
  }
);
