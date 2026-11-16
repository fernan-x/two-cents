import type { LocalDate } from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

export interface MemberIncomeProps {
  membershipId: string;
  /** Start date of the budget month. */
  monthStart: LocalDate;
  /** Exact minor units (Principle I). */
  amountMinor: bigint;
  currency: string;
  updatedAt: Date;
  updatedBy: string | null;
}

/** A member's income for one budget month (FR-024). Visible to everyone in the budget (FR-025a). */
export class MemberIncome {
  private constructor(private readonly props: MemberIncomeProps) {}

  static record(input: {
    membershipId: string;
    monthStart: LocalDate;
    amountMinor: bigint;
    currency: string;
    budgetCurrency: string;
    by: string;
    now: Date;
  }): MemberIncome {
    if (input.amountMinor < 0n) throw new DomainError('INVALID_AMOUNT');
    if (input.currency !== input.budgetCurrency)
      throw new DomainError('INVALID_AMOUNT');
    return new MemberIncome({
      membershipId: input.membershipId,
      monthStart: input.monthStart,
      amountMinor: input.amountMinor,
      currency: input.currency,
      updatedAt: input.now,
      updatedBy: input.by,
    });
  }

  static fromPersistence(props: MemberIncomeProps): MemberIncome {
    return new MemberIncome({ ...props });
  }

  toPersistence(): MemberIncomeProps {
    return { ...this.props };
  }

  get membershipId() {
    return this.props.membershipId;
  }
  get monthStart() {
    return this.props.monthStart;
  }
  get amountMinor() {
    return this.props.amountMinor;
  }
  get currency() {
    return this.props.currency;
  }
}
