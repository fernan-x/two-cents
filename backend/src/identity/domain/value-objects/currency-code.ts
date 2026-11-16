import { DomainError } from '../../../shared-kernel/domain/domain-error';

/** ISO 4217 code, 3 uppercase letters. */
export function toCurrencyCode(raw: string): string {
  if (/^[A-Z]{3}$/.test(raw)) return raw;
  throw new DomainError('VALIDATION_FAILED');
}
