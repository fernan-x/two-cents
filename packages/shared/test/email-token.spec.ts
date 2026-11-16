import { emailTokenExpiry, isEmailTokenValid } from '../src/domain/email-token';

const now = new Date('2026-11-16T10:00:00Z');
const valid = { usedAt: null, supersededAt: null, expiresAt: new Date('2026-11-16T11:00:00Z') };

describe('emailTokenExpiry', () => {
  it('confirm 24 h, reset 1 h, link 1 h', () => {
    expect(emailTokenExpiry('confirm_email', now)).toEqual(new Date('2026-11-17T10:00:00Z'));
    expect(emailTokenExpiry('reset_password', now)).toEqual(new Date('2026-11-16T11:00:00Z'));
    expect(emailTokenExpiry('link_account', now)).toEqual(new Date('2026-11-16T11:00:00Z'));
  });
  it('cancel = deletion_scheduled_at', () => {
    const scheduled = new Date('2026-11-23T10:00:00Z');
    expect(emailTokenExpiry('cancel_deletion', now, scheduled)).toEqual(scheduled);
  });
  it('cancel without a deletion date is an error', () => {
    expect(() => emailTokenExpiry('cancel_deletion', now)).toThrow();
  });
});

describe('isEmailTokenValid', () => {
  it('accepts an unused, current, unexpired token', () => {
    expect(isEmailTokenValid(valid, now)).toBe(true);
  });
  it('rejects used, superseded or expired tokens', () => {
    expect(isEmailTokenValid({ ...valid, usedAt: now }, now)).toBe(false);
    expect(isEmailTokenValid({ ...valid, supersededAt: now }, now)).toBe(false);
    expect(isEmailTokenValid(valid, new Date('2026-11-16T11:00:00Z'))).toBe(false);
  });
});
