/** Number of minor-unit digits of an ISO 4217 currency (2 for EUR, 0 for JPY). */
export function minorDigits(currency: string): number {
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}

/**
 * An amount typed by a person, in exact minor units (Principle I): `12,5` and `12.5` both give 1250
 * cents; spaces, including French no-break spaces, are thousands separators. Null for anything
 * negative, malformed or more precise than the currency allows.
 */
export function parseAmount(input: string, currency: string): bigint | null {
  const cleaned = input.replace(/[\s  ]/g, '');
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(cleaned);
  if (!match) return null;
  const digits = minorDigits(currency);
  const fraction = match[2] ?? '';
  if (fraction.length > digits) return null;
  return BigInt(match[1] + fraction.padEnd(digits, '0'));
}
