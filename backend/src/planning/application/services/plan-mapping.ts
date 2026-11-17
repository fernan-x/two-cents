import type {
  MonthSummaryView,
  PrivateAggregateView,
} from '@two-cents/shared/contracts';
import {
  isIncludedInMonth,
  type MonthSummary,
  type PlanIncome,
  type PlanLine,
  type PlanMember,
  type PrivateAggregate,
} from '@two-cents/shared/domain';
import type { Budget } from '../../../budgets/domain/entities/budget';
import type { Membership } from '../../../budgets/domain/entities/membership';
import type { BudgetLine } from '../../domain/entities/budget-line';
import type { BudgetMonth } from '../../domain/entities/budget-month';
import type { IncomeLine } from '../../domain/entities/income-line';

/** Members contributing to a month (002 FR-033), ordered by join date then id (FR-021 ties). */
export function contributingMembers(
  budget: Budget,
  memberships: readonly Membership[],
  month: { start: string; end: string },
): Membership[] {
  return memberships
    .filter((m) => isIncludedInMonth(m.forMonth(budget.timeZone), month))
    .sort(
      (a, b) =>
        a.joinedAt.getTime() - b.joinedAt.getTime() || a.id.localeCompare(b.id),
    );
}

export const toPlanMembers = (members: readonly Membership[]): PlanMember[] =>
  members.map((m, order) => ({ membershipId: m.id, order }));

export const toPlanIncomes = (incomes: readonly IncomeLine[]): PlanIncome[] =>
  incomes.map((i) => ({
    membershipId: i.membershipId,
    amount: i.amountMinor,
    counts: i.countsTowardHousehold,
  }));

export const toPlanLine = (l: BudgetLine): PlanLine => ({
  group: l.group,
  kind: l.kind,
  total: l.totalMinor,
  shares: l.shares,
});

/** Private lines of other members, as one sum per member (FR-019, research R10). */
export function privateAggregates(
  lines: readonly BudgetLine[],
  viewerMembershipId: string,
): Array<PrivateAggregate & { count: number }> {
  const byOwner = new Map<string, PrivateAggregate & { count: number }>();
  for (const l of lines) {
    if (!l.isPrivate || l.ownerMembershipId === viewerMembershipId) continue;
    const owner = l.ownerMembershipId!;
    const agg = byOwner.get(owner) ?? {
      membershipId: owner,
      total: 0n,
      savings: 0n,
      count: 0,
    };
    agg.total += l.totalMinor;
    if (l.kind === 'savings') agg.savings += l.totalMinor;
    agg.count += 1;
    byOwner.set(owner, agg);
  }
  return [...byOwner.values()];
}

export const privateAggregateView = (
  a: PrivateAggregate & { count: number },
): PrivateAggregateView => ({
  membershipId: a.membershipId,
  totalMinor: a.total.toString(),
  savingsMinor: a.savings.toString(),
  count: a.count,
});

export function summaryView(summary: MonthSummary): MonthSummaryView {
  return {
    members: summary.members.map((m) => ({
      membershipId: m.membershipId,
      countedIncomeMinor: m.countedIncome.toString(),
      otherIncomeMinor: m.otherIncome.toString(),
      diMinor: m.di.toString(),
      dcrMinor: m.dcr.toString(),
      dceMinor: m.dce.toString(),
      whatsLeftMinor: m.whatsLeft.toString(),
      transferMinor: m.transfer.toString(),
      savingsMinor: m.savings.toString(),
      savingsRatePermille: m.savingsRatePermille,
      overrun: m.overrun,
    })),
    household: {
      countedIncomeMinor: summary.household.countedIncome.toString(),
      otherIncomeMinor: summary.household.otherIncome.toString(),
      plannedMinor: summary.household.planned.toString(),
      whatsLeftMinor: summary.household.whatsLeft.toString(),
      transferMinor: summary.household.transfer.toString(),
      savingsMinor: summary.household.savings.toString(),
    },
  };
}

/** The frozen summary of a closed month, or null (FR-036). */
export const frozenSummary = (month: BudgetMonth): MonthSummaryView | null =>
  (month.closedSummary as MonthSummaryView | null) ?? null;
