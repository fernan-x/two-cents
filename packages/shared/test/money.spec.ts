import { minorDigits, parseAmount } from '../src/domain/money';

describe('parseAmount (Principle I)', () => {
  it('accepts a comma or a dot as decimal separator', () => {
    expect(parseAmount('12,5', 'EUR')).toBe(1250n);
    expect(parseAmount('12.5', 'EUR')).toBe(1250n);
    expect(parseAmount('12,05', 'EUR')).toBe(1205n);
    expect(parseAmount('12', 'EUR')).toBe(1200n);
  });

  it('accepts spaces as thousands separators, including the French no-break spaces', () => {
    expect(parseAmount('2 450,50', 'EUR')).toBe(245050n);
    expect(parseAmount('2 450,50', 'EUR')).toBe(245050n);
    expect(parseAmount('2 450,50', 'EUR')).toBe(245050n);
    expect(parseAmount('  2450,50 ', 'EUR')).toBe(245050n);
  });

  it('accepts zero', () => {
    expect(parseAmount('0', 'EUR')).toBe(0n);
  });

  it('keeps large amounts exact', () => {
    expect(parseAmount('90071992547409,93', 'EUR')).toBe(9007199254740993n);
  });

  it('refuses negative, malformed or over-precise input', () => {
    for (const bad of ['-5', '12,345', '12,5,0', 'abc', '', ' ', '1e3', '12,', ',5']) {
      expect(parseAmount(bad, 'EUR')).toBeNull();
    }
  });

  it('follows the currency minor unit', () => {
    expect(minorDigits('EUR')).toBe(2);
    expect(minorDigits('JPY')).toBe(0);
    expect(parseAmount('1200', 'JPY')).toBe(1200n);
    expect(parseAmount('1200,5', 'JPY')).toBeNull();
  });
});
