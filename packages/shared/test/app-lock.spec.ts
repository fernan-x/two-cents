import { APP_LOCK_GRACE_MS, shouldLock } from '../src/domain/app-lock';

const now = new Date('2026-11-16T10:00:30.000Z');
const enabled = { biometricEnabled: true, requireOnEveryOpen: true };

describe('shouldLock', () => {
  it('locks on cold start when the lock is enabled', () => {
    expect(shouldLock({ coldStart: true, backgroundedAt: null, now, settings: enabled })).toBe(true);
  });
  it('does not lock after exactly 30 s in background', () => {
    expect(APP_LOCK_GRACE_MS).toBe(30_000);
    const backgroundedAt = new Date('2026-11-16T10:00:00.000Z');
    expect(shouldLock({ coldStart: false, backgroundedAt, now, settings: enabled })).toBe(false);
  });
  it('locks after more than 30 s in background', () => {
    const backgroundedAt = new Date('2026-11-16T09:59:59.999Z');
    expect(shouldLock({ coldStart: false, backgroundedAt, now, settings: enabled })).toBe(true);
  });
  it('never locks when "require on every open" is off', () => {
    const settings = { biometricEnabled: true, requireOnEveryOpen: false };
    expect(shouldLock({ coldStart: true, backgroundedAt: null, now, settings })).toBe(false);
    const backgroundedAt = new Date('2026-11-16T09:00:00Z');
    expect(shouldLock({ coldStart: false, backgroundedAt, now, settings })).toBe(false);
  });
  it('does not lock when returning without a recorded background time', () => {
    expect(shouldLock({ coldStart: false, backgroundedAt: null, now, settings: enabled })).toBe(false);
  });
});
