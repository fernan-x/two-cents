import { useAuth } from './auth-store';

/**
 * FR-011: inviting or joining a shared budget needs a confirmed email.
 * Returns whether the action may run; screens show <UnconfirmedEmailBanner/> otherwise.
 * Spec 002 reuses this for its invite actions (its API answers 403 email_not_confirmed).
 */
export function useRequireConfirmedEmail(): { allowed: boolean } {
  const { me } = useAuth();
  return { allowed: Boolean(me?.emailConfirmed) };
}
