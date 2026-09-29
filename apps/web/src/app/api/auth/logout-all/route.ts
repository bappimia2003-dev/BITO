import { NextResponse } from 'next/server.js';
import { withRoute } from '../../../../server/http/withRoute.js';
import { revokeAllSessionsForUser } from '../../../../server/repositories/sessions.js';
import { buildSessionClearCookie, serializeCookieHeader } from '../../../../server/auth/cookies.js';
import { recordAuditLog } from '../../../../server/repositories/audit.js';

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    auth: true,
    recentAuth: true,
  },
  async ({ user, session, req }) => {
    if (!user || !session) {
      return NextResponse.json({ success: true });
    }

    await revokeAllSessionsForUser(user.id);

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = req.headers.get('user-agent') || undefined;

    await recordAuditLog({
      userId: user.id,
      action: 'auth.logout_all',
      targetType: 'user',
      targetId: user.id,
      ip,
      userAgent,
    });

    const res = NextResponse.json({ success: true, message: 'All sessions revoked' });
    res.headers.set('Set-Cookie', serializeCookieHeader(buildSessionClearCookie()));
    return res;
  }
);
