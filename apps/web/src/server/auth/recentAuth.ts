import { BitoError } from '@bito/shared';

export function assertRecentAuth(session: { lastAuthAt: string | Date }, maxAgeSec = 300): void {
  const lastAuthMs =
    session.lastAuthAt instanceof Date
      ? session.lastAuthAt.getTime()
      : new Date(session.lastAuthAt).getTime();

  const elapsedSec = (Date.now() - lastAuthMs) / 1000;

  if (elapsedSec > maxAgeSec) {
    throw BitoError(
      'REAUTH_REQUIRED',
      'Recent authentication required. Please re-authenticate to perform this action.',
      {
        httpStatus: 401,
        details: { maxAgeSec, elapsedSec: Math.floor(elapsedSec) },
      }
    );
  }
}
