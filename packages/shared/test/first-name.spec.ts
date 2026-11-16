import { validateFirstName } from '../src/domain/first-name';

describe('validateFirstName', () => {
  it('trims and normalizes to NFC', () => {
    const nfd = 'Maëlle';
    const result = validateFirstName(`  ${nfd} `);
    expect(result).toEqual({ ok: true, value: 'Maëlle' });
    expect(result.ok && result.value.normalize('NFC')).toBe(result.ok && result.value);
  });
  it('rejects empty and whitespace-only names', () => {
    expect(validateFirstName('')).toEqual({ ok: false });
    expect(validateFirstName('   ')).toEqual({ ok: false });
  });
  it('accepts 50 code points and rejects 51', () => {
    expect(validateFirstName('é'.repeat(50)).ok).toBe(true);
    expect(validateFirstName('é'.repeat(51)).ok).toBe(false);
  });
  it('accepts any script', () => {
    expect(validateFirstName('Ли')).toEqual({ ok: true, value: 'Ли' });
  });
});
