import { MAX_START_DAY, MIN_START_DAY } from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

/** The day a budget month starts: 1–28, so every month has it (FR-001, edge case "29th–31st"). */
export class MonthStartDay {
  private constructor(readonly value: number) {}

  static create(day: number): MonthStartDay {
    if (!Number.isInteger(day) || day < MIN_START_DAY || day > MAX_START_DAY)
      throw new DomainError('VALIDATION_FAILED', {
        issues: [{ path: ['monthStartDay'], message: '1–28' }],
      });
    return new MonthStartDay(day);
  }
}
