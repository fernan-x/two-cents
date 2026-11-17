import { MAX_AMOUNT_MINOR, minorDigits, parseAmount, parseBoundedAmount } from '../src/domain/money';

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


describe('parseBoundedAmount (FR-026)', () => {
  it('caps amounts at 1 000 000,00 €', () => {
    expect(MAX_AMOUNT_MINOR).toBe(100_000_000n);
    expect(parseBoundedAmount('1 000 000,00', 'EUR')).toBe(100_000_000n);
    expect(parseBoundedAmount('1 000 000,01', 'EUR')).toBeNull();
  });

  it('accepts what parseAmount accepts', () => {
    expect(parseBoundedAmount('12,5', 'EUR')).toBe(1250n);
    expect(parseBoundedAmount('12.5', 'EUR')).toBe(1250n);
    expect(parseBoundedAmount('1 234,56', 'EUR')).toBe(123456n);
  });

  it('refuses invalid input', () => {
    for (const bad of ['-3', '12,5a', '12,555', '1,2,3', '']) expect(parseBoundedAmount(bad, 'EUR')).toBeNull();
  });
});
