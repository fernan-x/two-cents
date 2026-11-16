import { Inject, Injectable } from '@nestjs/common';
import type { Money } from '@two-cents/shared/contracts';
import { isIncludedInMonth } from '@two-cents/shared/domain';
import {
  CLOCK,
  type Clock,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import { MemberIncome } from '../../domain/entities/member-income';
import {
  INCOME_REPOSITORY,
  type IncomeRepository,
} from '../../domain/ports/repositories';
import { BudgetAccess } from '../services/budget-access';

/**
 * US2: a member's monthly income (FR-024), in exact minor units. Only for a real budget month,
 * the current one or a past one the member was included in (contracts/rest-api.md).
 */
@Injectable()
export class RecordIncome {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(INCOME_REPOSITORY) private readonly incomes: IncomeRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  execute(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    amountMinor: string,
  ): Promise<Money> {
    return this.tx.run(async () => {
      const { budget, membership } = await this.access.require(
        budgetId,
        auth.userId,
        'income.write.own',
        { forUpdate: true },
      );
      const now = this.clock.now();
      const month = budget.monthOf(monthStart);
      if (
        month.start !== monthStart ||
        monthStart > budget.currentMonth(now).start ||
        !isIncludedInMonth(membership.forMonth(budget.timeZone), month)
      )
        throw new DomainError('INVALID_MONTH');
      let amount: bigint;
      try {
        amount = BigInt(amountMinor);
      } catch {
        throw new DomainError('INVALID_AMOUNT');
      }
      const income = MemberIncome.record({
        membershipId: membership.id,
        monthStart,
        amountMinor: amount,
        currency: budget.currency,
        budgetCurrency: budget.currency,
        by: auth.userId,
        now,
      });
      await this.incomes.save(income);
      return {
        amountMinor: income.amountMinor.toString(),
        currency: income.currency,
      };
    });
  }
}
