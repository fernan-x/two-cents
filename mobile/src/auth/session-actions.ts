import { apiRequest } from './api-client';
import { useAuth } from './auth-store';

/** Sign out: ends the session on the server (FR-024), then forgets it locally even when offline. */
export function useSignOut() {
  const auth = useAuth();
  return async () => {
    try {
      await apiRequest('POST', '/v1/auth/logout');
    } catch {
      // Offline or already ended: the local sign-out still happens.
    }
    await auth.signOutLocally('logout');
  };
}
