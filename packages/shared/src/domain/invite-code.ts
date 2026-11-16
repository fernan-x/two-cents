/** Crockford Base32: digits and letters without I, L, O and U (research R6). */
export const INVITE_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const INVITE_CODE_LENGTH = 6;

/**
 * The canonical code typed or pasted by a person, or null when it can't be one: case-insensitive,
 * spaces and dashes ignored, O read as 0 and I/L as 1.
 */
export function normalizeInviteCode(input: string): string | null {
  const code = input
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (code.length !== INVITE_CODE_LENGTH) return null;
  for (const ch of code) if (!INVITE_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** `ABC120` → `ABC-120`, the form shown to people. */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 3)}-${code.slice(3)}`;
}

/** A new code. `randomInt(max)` returns an integer in [0, max); pass `crypto.randomInt` on the server. */
export function generateInviteCode(randomInt: (max: number) => number): string {
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
  return code;
}
