import { normalizeEmail } from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

/** An email address: kept as entered (trimmed) for display, normalized for uniqueness (FR-003). */
export class Email {
  private constructor(
    readonly display: string,
    readonly normalized: string,
  ) {}

  static create(raw: string): Email {
    const display = raw.trim();
    if (!/^[^\s@]+@[^\s@]+$/.test(display))
      throw new DomainError('VALIDATION_FAILED');
    return new Email(display, normalizeEmail(display));
  }

  equals(other: Email): boolean {
    return this.normalized === other.normalized;
  }
}
