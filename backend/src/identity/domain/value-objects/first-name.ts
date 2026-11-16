import { validateFirstName } from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

/** NFC, trimmed, 1–50 code points, any script (FR-039). */
export class FirstName {
  private constructor(readonly value: string) {}

  static create(raw: string): FirstName {
    const result = validateFirstName(raw);
    if (!result.ok) throw new DomainError('VALIDATION_FAILED');
    return new FirstName(result.value);
  }
}
