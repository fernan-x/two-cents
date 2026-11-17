import { Inject, Injectable } from '@nestjs/common';
import type {
  ListMonthsResponse,
  MonthSummaryView,
} from '@two-cents/shared/contracts';
import { computeMonthSummary } from '@two-cents/shared/domain';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../budgets/domain/ports/repositories';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import {
  INCOME_LINE_REPOSITORY,
  type IncomeLineRepository,
  LINE_REPOSITORY,
  type LineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../domain/ports/repositories';
import {
  contributingMembers,
  frozenSummary,
  summaryView,
  toPlanIncomes,
  toPlanLine,
  toPlanMembers,
} from '../services/plan-mapping';

const PAGE = 12;

/**
 * US7: months newest first with each member's "what's left" (FR-008). Closed months show their
 * frozen figures; private lines count in totals (they never show here).
 */
@Injectable()
export class ListMonths {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
    @Inject(INCOME_LINE_REPOSITORY)
    private readonly incomes: IncomeLineRepository,
  ) {}

  async execute(
    auth: AuthContext,
    budgetId: string,
    cursor: string | null,
  ): Promise<ListMonthsResponse> {
    const { budget } = await this.access.require(
      budgetId,
      auth.userId,
      'budget.read',
    );
    const page = await this.months.list(budgetId, cursor, PAGE + 1);
    const months = page.slice(0, PAGE);
    const open = months.filter((m) => m.status !== 'closed').map((m) => m.id);
    const [all, lines, incomes] = await Promise.all([
      this.memberships.listByBudget(budgetId),
      this.lines.listForMonths(open),
      this.incomes.listForMonths(open),
    ]);
    return {
      months: months.map((m) => {
        const summary: MonthSummaryView =
          frozenSummary(m) ??
          summaryView(
            computeMonthSummary({
              members: toPlanMembers(
                contributingMembers(budget, all, m.period),
              ),
              incomes: toPlanIncomes(incomes.filter((i) => i.monthId === m.id)),
              lines: lines.filter((l) => l.monthId === m.id).map(toPlanLine),
              privateAggregates: [],
            }),
          );
        return {
          start: m.periodStart,
          end: m.periodEnd,
          status: m.status,
          members: summary.members.map((s) => ({
            membershipId: s.membershipId,
            whatsLeftMinor: s.whatsLeftMinor,
            overrun: s.overrun,
          })),
        };
      }),
      nextCursor:
        page.length > PAGE ? months[months.length - 1].periodStart : null,
    };
  }
}
