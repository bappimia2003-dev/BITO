import { NextResponse } from 'next/server.js';
import { withRoute } from '../../../../server/http/withRoute.js';
import { countCredentialsForUser } from '../../../../server/repositories/webauthn.js';

export const runtime = 'nodejs';

export const GET = withRoute(
  {
    auth: true,
  },
  async ({ user, session }) => {
    if (!user || !session) {
      return NextResponse.json({ user: null });
    }

    const passkeyCount = await countCredentialsForUser(user.id);

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        hasPassword: Boolean(user.passwordHash),
        passkeyCount,
        createdAt: user.createdAt,
      },
      session: {
        id: session.id,
        lastAuthAt: session.lastAuthAt,
        expiresAt: session.expiresAt,
      },
    });
  }
);
