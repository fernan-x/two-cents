export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface LockState {
  failedCount: number;
  lockedUntil: Date | null;
}

/**
 * State after one more failed password attempt (spec FR-005).
 * Reaching the threshold locks for 15 minutes; a failure once a lock has been
 * reached starts a new count.
 */
export function nextLockState(currentFailedCount: number, now: Date): LockState {
  const failedCount = currentFailedCount >= LOCKOUT_THRESHOLD ? 1 : currentFailedCount + 1;
  return {
    failedCount,
    lockedUntil:
      failedCount === LOCKOUT_THRESHOLD ? new Date(now.getTime() + LOCKOUT_DURATION_MS) : null,
  };
}

export function isLockedOut(state: { lockedUntil: Date | null }, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}
