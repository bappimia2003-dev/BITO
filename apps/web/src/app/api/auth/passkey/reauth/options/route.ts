import { NextResponse } from 'next/server.js';
import { BitoError } from '@bito/shared';
import { withRoute } from '../../../../../../server/http/withRoute.js';
import { createPasskeyReauthOptions } from '../../../../../../server/auth/webauthnService.js';

export const runtime = 'nodejs';

export const POST = withRoute(
  {
    auth: true,
  },
  async ({ user }) => {
    if (!user) {
      throw BitoError('UNAUTHORIZED', 'Authentication required', { httpStatus: 401 });
    }

    const options = await createPasskeyReauthOptions(user.id);
    return NextResponse.json(options);
  }
);
