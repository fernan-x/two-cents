import { Inject, Injectable } from '@nestjs/common';
import type { TrackingView } from '@two-cents/shared/contracts';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import {
  INCOME_LINE_REPOSITORY,
  type IncomeLineRepository,
  LINE_REPOSITORY,
  type LineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../../planning/domain/ports/repositories';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  SETTLEMENT_REPOSITORY,
  type SettlementRepository,
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/ports/repositories';
import { TrackingViews } from '../services/tracking-views';

/**
 * US2/US6/US7: planned vs actual, envelopes, balances and meal vouchers of a month. A Closed
 * month's lines and transactions cannot change, so its figures are stable without a snapshot (R5).
 */
@Injectable()
export class GetTracking {
  constructor(
    private readonly access: BudgetAccess,
    private readonly views: TrackingViews,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
    @Inject(INCOME_LINE_REPOSITORY)
    private readonly incomes: IncomeLineRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly txns: TransactionRepository,
    @Inject(SETTLEMENT_REPOSITORY)
    private readonly settlements: SettlementRepository,
  ) {}

  async execute(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
  ): Promise<TrackingView> {
    const { budget, membership } = await this.access.require(
      budgetId,
      auth.userId,
      'transactions.read',
    );
    const month = await this.months.findByStart(budgetId, monthStart);
    if (!month) throw new DomainError('MONTH_NOT_FOUND');
    const [lines, incomes, txns, settlements] = await Promise.all([
      this.lines.listForMonth(month.id),
      this.incomes.listForMonth(month.id),
      this.txns.listForMonth(month.id),
      this.settlements.listForMonth(month.id),
    ]);
    return this.views.tracking({
      budget,
      me: membership,
      month,
      lines,
      incomes,
      txns,
      settlements,
    });
  }
}
