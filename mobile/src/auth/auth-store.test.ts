import type { Me } from '@two-cents/shared/contracts';

import { authReducer, initialAuthState } from './auth-store';

const me: Me = {
  id: '00000000-0000-7000-8000-000000000001',
  email: 'maelle@example.com',
  emailConfirmed: false,
  firstName: 'Maëlle',
  avatarKey: 'initials',
  colorKey: 'blue',
  locale: 'fr',
  currency: 'EUR',
  signInMethods: ['password'],
  status: 'active',
  deletionScheduledAt: null,
  hasBudget: false,
};

describe('authReducer', () => {
  it('signs in and out with a reason', () => {
    const signedIn = authReducer(initialAuthState, { type: 'signedIn', me });
    expect(signedIn.status).toBe('signedIn');
    const signedOut = authReducer(signedIn, { type: 'signedOut', reason: 'revoked_by_user' });
    expect(signedOut).toEqual({ status: 'signedOut', me: null, endReason: 'revoked_by_user' });
  });

  it('routes pending-deletion accounts to their own state', () => {
    const state = authReducer(initialAuthState, { type: 'signedIn', me: { ...me, status: 'pending_deletion' } });
    expect(state.status).toBe('pendingDeletion');
  });

  it('locks and unlocks only when signed in', () => {
    expect(authReducer(initialAuthState, { type: 'locked' }).status).toBe('booting');
    const locked = authReducer(authReducer(initialAuthState, { type: 'signedIn', me }), { type: 'locked' });
    expect(locked.status).toBe('locked');
    expect(authReducer(locked, { type: 'meUpdated', me }).status).toBe('locked');
    expect(authReducer(locked, { type: 'unlocked' }).status).toBe('signedIn');
  });
});
