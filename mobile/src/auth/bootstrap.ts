import { Me, Tokens } from '@two-cents/shared/contracts';
import { z } from 'zod';

import { ApiError, apiRequest } from './api-client';
import { secureStorage } from './secure-storage';
import { tokenStore } from './token-store';

const RefreshResponse = z.object({ tokens: Tokens });

let inFlight: Promise<boolean> | null = null;

/**
 * Exchanges the stored refresh token for a new pair (single flight: concurrent callers share one call).
 * Returns false when there is no session to refresh. Throws ApiError SESSION_ENDED when the server ended it.
 */
export function refreshTokens(): Promise<boolean> {
  inFlight ??= (async () => {
    try {
      const refreshToken = await secureStorage.getRefreshToken();
      if (!refreshToken) return false;
      const { tokens } = await apiRequest('POST', '/v1/auth/refresh', {
        body: { refreshToken },
        schema: RefreshResponse,
        auth: false,
      });
      tokenStore.set(tokens.accessToken);
      await secureStorage.setRefreshToken(tokens.refreshToken);
      return true;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

export type BootstrapResult =
  | { kind: 'signedOut' }
  | { kind: 'ended'; reason: ApiError['details']['reason'] }
  | { kind: 'signedIn'; me: Me }
  | { kind: 'offline' };

/** Cold start: restore the session from the stored refresh token (spec US2). */
export async function bootstrapSession(): Promise<BootstrapResult> {
  try {
    if (!(await refreshTokens())) return { kind: 'signedOut' };
    const me = await apiRequest('GET', '/v1/me', { schema: Me });
    return { kind: 'signedIn', me };
  } catch (error) {
    if (error instanceof ApiError && error.code === 'NETWORK') return { kind: 'offline' };
    if (error instanceof ApiError && (error.code === 'SESSION_ENDED' || error.code === 'UNAUTHENTICATED')) {
      return { kind: 'ended', reason: error.details.reason };
    }
    return { kind: 'signedOut' };
  }
}
