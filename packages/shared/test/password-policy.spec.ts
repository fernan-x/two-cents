import { PASSWORD_MIN_LENGTH, validatePasswordPolicy } from '../src/domain/password-policy';

describe('validatePasswordPolicy', () => {
  it('requires at least 10 characters', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(validatePasswordPolicy('123456789')).toEqual({ ok: false, reason: 'PASSWORD_TOO_SHORT' });
    expect(validatePasswordPolicy('1234567890')).toEqual({ ok: true });
  });
  it('counts Unicode code points, not UTF-16 units', () => {
    expect(validatePasswordPolicy('😀'.repeat(9))).toEqual({ ok: false, reason: 'PASSWORD_TOO_SHORT' });
    expect(validatePasswordPolicy('😀'.repeat(10))).toEqual({ ok: true });
  });
});
