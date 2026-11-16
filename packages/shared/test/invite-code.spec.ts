import {
  formatInviteCode,
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  normalizeInviteCode,
} from '../src/domain/invite-code';

describe('normalizeInviteCode (research R6)', () => {
  it('upper-cases, strips separators and maps look-alikes', () => {
    expect(normalizeInviteCode('abc-12o')).toBe('ABC120');
    expect(normalizeInviteCode(' x7k 9pq ')).toBe('X7K9PQ');
    expect(normalizeInviteCode('il0-o1L')).toBe('110011');
  });

  it('returns null for a wrong length', () => {
    expect(normalizeInviteCode('ABC12')).toBeNull();
    expect(normalizeInviteCode('ABC1234')).toBeNull();
    expect(normalizeInviteCode('')).toBeNull();
  });

  it('returns null for characters outside the Crockford alphabet', () => {
    expect(normalizeInviteCode('ABCU23')).toBeNull();
    expect(normalizeInviteCode('ABC#23')).toBeNull();
  });
});

describe('formatInviteCode', () => {
  it('splits the code in two groups of three', () => {
    expect(formatInviteCode('ABC120')).toBe('ABC-120');
  });
});

describe('generateInviteCode', () => {
  it('uses only the 32-symbol alphabet, without I, L, O or U', () => {
    expect(INVITE_CODE_ALPHABET).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ');
    let n = 0;
    const code = generateInviteCode((max) => n++ % max);
    expect(code).toBe('012345');
    const random = generateInviteCode((max) => Math.floor(Math.random() * max));
    expect(random).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
    expect(normalizeInviteCode(random)).toBe(random);
  });

  it('can produce the last symbol', () => {
    expect(generateInviteCode((max) => max - 1)).toBe('ZZZZZZ');
  });
});
