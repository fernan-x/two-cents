import type { AuthResult, Me, SessionEndReason } from '@two-cents/shared/contracts';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useReducer } from 'react';

import { secureStorage } from './secure-storage';
import { trackingClient } from '@/features/tracking/client';
import { clearPersistedTracking } from '@/features/tracking/persist';
import { tokenStore } from './token-store';

export type AuthStatus = 'booting' | 'signedOut' | 'signedIn' | 'locked' | 'pendingDeletion';

export interface AuthState {
  status: AuthStatus;
  me: Me | null;
  /** Why the user was signed out, shown once on the sign-in screen. */
  endReason: SessionEndReason | null;
}

export type AuthAction =
  | { type: 'signedIn'; me: Me }
  | { type: 'meUpdated'; me: Me }
  | { type: 'signedOut'; reason?: SessionEndReason }
  | { type: 'locked' }
  | { type: 'unlocked' }
  | { type: 'endReasonShown' };

export const initialAuthState: AuthState = { status: 'booting', me: null, endReason: null };

const statusFor = (me: Me): AuthStatus => (me.status === 'pending_deletion' ? 'pendingDeletion' : 'signedIn');

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'signedIn':
      return { status: statusFor(action.me), me: action.me, endReason: null };
    case 'meUpdated':
      return state.status === 'locked' ? { ...state, me: action.me } : { ...state, me: action.me, status: statusFor(action.me) };
    case 'signedOut':
      return { status: 'signedOut', me: null, endReason: action.reason ?? null };
    case 'locked':
      return state.me ? { ...state, status: 'locked' } : state;
    case 'unlocked':
      return state.me ? { ...state, status: statusFor(state.me) } : state;
    case 'endReasonShown':
      return { ...state, endReason: null };
  }
}

interface AuthContextValue extends AuthState {
  /** Stores the session after sign-up / sign-in / link. */
  acceptAuthResult(result: AuthResult): Promise<void>;
  setMe(me: Me): void;
  signOutLocally(reason?: SessionEndReason): Promise<void>;
  lock(): void;
  unlock(): void;
  clearEndReason(): void;
  dispatch(action: AuthAction): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  const acceptAuthResult = useCallback(async (result: AuthResult) => {
    tokenStore.set(result.tokens.accessToken);
    await secureStorage.setRefreshToken(result.tokens.refreshToken);
    dispatch({ type: 'signedIn', me: result.me });
  }, []);

  const signOutLocally = useCallback(async (reason?: SessionEndReason) => {
    tokenStore.set(null);
    await secureStorage.clearRefreshToken();
    // Spec 004 R3: no transaction of the previous person stays on the device.
    await clearPersistedTracking(trackingClient() ?? undefined);
    dispatch({ type: 'signedOut', reason });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      acceptAuthResult,
      signOutLocally,
      setMe: (me) => dispatch({ type: 'meUpdated', me }),
      lock: () => dispatch({ type: 'locked' }),
      unlock: () => dispatch({ type: 'unlocked' }),
      clearEndReason: () => dispatch({ type: 'endReasonShown' }),
      dispatch,
    }),
    [state, acceptAuthResult, signOutLocally],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
