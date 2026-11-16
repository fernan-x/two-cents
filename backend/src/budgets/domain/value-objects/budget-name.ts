import { DomainError } from '../../../shared-kernel/domain/domain-error';

const MAX_LENGTH = 60;

/** A budget name: NFC-normalized, trimmed, 1–60 characters (FR-001). */
export class BudgetName {
  private constructor(readonly value: string) {}

  static create(raw: string): BudgetName {
    const value = raw.normalize('NFC').trim();
    if (value.length === 0 || [...value].length > MAX_LENGTH)
      throw new DomainError('INVALID_BUDGET_NAME');
    return new BudgetName(value);
  }
}
