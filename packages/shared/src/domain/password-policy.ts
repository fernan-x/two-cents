export const PASSWORD_MIN_LENGTH = 10;

export type PasswordPolicyResult = { ok: true } | { ok: false; reason: 'PASSWORD_TOO_SHORT' };

/** Length is counted in Unicode code points, so emoji count as one character (spec FR-004). */
export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  return Array.from(password).length >= PASSWORD_MIN_LENGTH
    ? { ok: true }
    : { ok: false, reason: 'PASSWORD_TOO_SHORT' };
}
