import type { Money } from '@two-cents/shared/contracts';
import { minorDigits } from '@two-cents/shared/domain';

const localeTag = (language: string) => (language === 'en' ? 'en-GB' : 'fr-FR');

/** Exact minor units to a localized amount; the integer stays a string until display (Principle I). */
export function formatMoney(money: Money, language: string): string {
  return formatMinor(money.amountMinor, money.currency, language);
}

/** Like {@link formatMoney}, for a minor-unit string that may be negative (spec 003: "-684" → "-6,84 €"). */
export function formatMinor(amountMinor: string, currency: string, language: string): string {
  const negative = amountMinor.startsWith('-');
  const digits = minorDigits(currency);
  const padded = (negative ? amountMinor.slice(1) : amountMinor).padStart(digits + 1, '0');
  const major = digits > 0 ? `${padded.slice(0, -digits)}.${padded.slice(-digits)}` : padded;
  return new Intl.NumberFormat(localeTag(language), { style: 'currency', currency }).format(
    negative ? -Number(major) : Number(major),
  );
}

/** `2026-11-01` → "1 nov." in the person's language. */
export function formatDay(date: string, language: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat(localeTag(language), {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** An ISO instant → "16 nov. 2026". */
export function formatDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(localeTag(language), { dateStyle: 'medium' }).format(new Date(iso));
}

/** Exact sum of amounts in `currency` (others are skipped); stays in minor units (Principle I). */
export function sumMoney(amounts: readonly (Money | null)[], currency: string): Money {
  const total = amounts.reduce((acc, m) => (m && m.currency === currency ? acc + BigInt(m.amountMinor) : acc), 0n);
  return { currency, amountMinor: total.toString() } as Money;
}
