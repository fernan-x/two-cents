import { isLockedOut, LOCKOUT_DURATION_MS, LOCKOUT_THRESHOLD, nextLockState } from '../src/domain/lockout';

const now = new Date('2026-11-16T10:00:00Z');

describe('lockout', () => {
  it('locks for 15 minutes at the 5th consecutive failure', () => {
    expect(LOCKOUT_THRESHOLD).toBe(5);
    expect(LOCKOUT_DURATION_MS).toBe(15 * 60 * 1000);
    expect(nextLockState(3, now)).toEqual({ failedCount: 4, lockedUntil: null });
    expect(nextLockState(4, now)).toEqual({
      failedCount: 5,
      lockedUntil: new Date('2026-11-16T10:15:00Z'),
    });
  });
  it('is locked until the lock expires', () => {
    const lockedUntil = new Date('2026-11-16T10:15:00Z');
    expect(isLockedOut({ lockedUntil }, now)).toBe(true);
    expect(isLockedOut({ lockedUntil }, new Date('2026-11-16T10:15:00Z'))).toBe(false);
    expect(isLockedOut({ lockedUntil: null }, now)).toBe(false);
  });
  it('a failure after an expired lock starts a new count', () => {
    expect(nextLockState(5, now)).toEqual({ failedCount: 1, lockedUntil: null });
  });
});
