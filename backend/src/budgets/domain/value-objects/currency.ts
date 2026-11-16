import { DomainError } from '../../../shared-kernel/domain/domain-error';

/** ISO 4217 code, 3 upper-case letters. */
export function toCurrency(code: string): string {
  if (!/^[A-Z]{3}$/.test(code))
    throw new DomainError('VALIDATION_FAILED', {
      issues: [{ path: ['currency'], message: 'ISO 4217 code' }],
    });
  return code;
}
