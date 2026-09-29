import { NextResponse } from 'next/server.js';
import { BitoError } from '@bito/shared';
import { withRoute } from '../../../../server/http/withRoute.js';
import { listCredentialsForUser } from '../../../../server/repositories/webauthn.js';

export const runtime = 'nodejs';

export const GET = withRoute(
  {
    auth: true,
  },
  async ({ user }) => {
    if (!user) {
      throw BitoError('UNAUTHORIZED', 'Authentication required', { httpStatus: 401 });
    }

    const credentials = await listCredentialsForUser(user.id);

    // Return safe view: NEVER expose raw public key bytes or challenge
    const safeCredentials = credentials.map((c) => ({
      id: c.id,
      credentialId: c.credentialId,
      deviceName: c.deviceName ?? 'Passkey',
      transports: c.transports,
      createdAt: c.createdAt,
      lastUsedAt: c.lastUsedAt,
    }));

    return NextResponse.json({ passkeys: safeCredentials });
  }
);
