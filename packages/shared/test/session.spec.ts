import { isSessionActive, SESSION_IDLE_LIMIT_MS } from '../src/domain/session';

const now = new Date('2026-11-16T10:00:00Z');
const daysAgo = (d: number, extraMs = 0) => new Date(now.getTime() - d * 86_400_000 - extraMs);

describe('isSessionActive', () => {
  it('is active up to exactly 90 idle days', () => {
    expect(SESSION_IDLE_LIMIT_MS).toBe(90 * 86_400_000);
    expect(isSessionActive({ revokedAt: null, lastUsedAt: daysAgo(90) }, now)).toBe(true);
  });
  it('expires after 90 days and 1 ms', () => {
    expect(isSessionActive({ revokedAt: null, lastUsedAt: daysAgo(90, 1) }, now)).toBe(false);
  });
  it('is inactive once revoked', () => {
    expect(isSessionActive({ revokedAt: daysAgo(1), lastUsedAt: now }, now)).toBe(false);
  });
});
