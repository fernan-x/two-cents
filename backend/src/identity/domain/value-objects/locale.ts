import { DomainError } from '../../../shared-kernel/domain/domain-error';

export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export function toLocale(raw: string): Locale {
  if ((LOCALES as readonly string[]).includes(raw)) return raw as Locale;
  throw new DomainError('VALIDATION_FAILED');
}
