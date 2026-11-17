import { Inject, Injectable } from '@nestjs/common';
import type {
  IncomeLineView,
  LineView,
  MonthAction,
  MonthDetail,
} from '@two-cents/shared/contracts';
import { can, computeMonthSummary } from '@two-cents/shared/domain';
import { BudgetViews } from '../../../budgets/application/services/budget-views';
import type { Budget } from '../../../budgets/domain/entities/budget';
import type { Membership } from '../../../budgets/domain/entities/membership';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../budgets/domain/ports/repositories';
import type { BudgetLine } from '../../domain/entities/budget-line';
import type { BudgetMonth } from '../../domain/entities/budget-month';
import type { IncomeLine } from '../../domain/entities/income-line';
import {
  INCOME_LINE_REPOSITORY,
  type IncomeLineRepository,
  LINE_REPOSITORY,
  type LineRepository,
} from '../../domain/ports/repositories';
import { ACTUALS_PROVIDER, type ActualsProvider } from '../ports';
import {
  contributingMembers,
  frozenSummary,
  privateAggregates,
  privateAggregateView,
  summaryView,
  toPlanIncomes,
  toPlanLine,
  toPlanMembers,
} from './plan-mapping';

const GROUP_ORDER = {
  personal: 0,
  recurring_shared: 1,
  one_off_shared: 2,
} as const;

/**
 * Builds `MonthDetail` for one person (contracts/rest-api.md). Private lines of other members are
 * never serialized: they appear only in `privateAggregates` (FR-019, research R10). The summary is
 * computed from every line, so it is identical for everyone.
 */
@Injectable()
export class MonthDetailView {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
    @Inject(INCOME_LINE_REPOSITORY)
    private readonly incomes: IncomeLineRepository,
    @Inject(ACTUALS_PROVIDER) private readonly actuals: ActualsProvider,
    private readonly people: BudgetViews,
  ) {}

  async build(
    budget: Budget,
    me: Membership,
    month: BudgetMonth,
  ): Promise<MonthDetail> {
    const [all, lines, incomes, actuals] = await Promise.all([
      this.memberships.listByBudget(budget.id),
      this.lines.listForMonth(month.id),
      this.incomes.listForMonth(month.id),
      this.actuals.forMonth(month.id),
    ]);
    const members = contributingMembers(budget, all, month.period);
    const refs = await this.people.personRefs(members);
    const closed = month.status === 'closed';
    const summary =
      frozenSummary(month) ??
      summaryView(
        computeMonthSummary({
          members: toPlanMembers(members),
          incomes: toPlanIncomes(incomes),
          lines: lines.map(toPlanLine),
          privateAggregates: [],
        }),
      );
    const visible = lines
      .filter((l) => !l.isPrivate || l.ownerMembershipId === me.id)
      .sort(
        (a, b) =>
          GROUP_ORDER[a.group] - GROUP_ORDER[b.group] ||
          (a.ownerMembershipId ?? '').localeCompare(
            b.ownerMembershipId ?? '',
          ) ||
          a.position - b.position,
      );
    const canWrite = !closed && can(me.role, 'entries.write');
    const canIncome = !closed && can(me.role, 'income.write.own');

    return {
      month: {
        start: month.periodStart,
        end: month.periodEnd,
        status: month.status,
        revision: month.revision.toString(),
        createdFrom: month.createdFrom,
        activatedAt: month.activatedAt?.toISOString() ?? null,
        closedAt: month.closedAt?.toISOString() ?? null,
      },
      currency: budget.currency,
      members: members.map((m, order) => ({
        ...refs.get(m.id)!,
        isMe: m.id === me.id,
        order,
      })),
      incomes: incomes.map((i) =>
        incomeView(i, canIncome && i.membershipId === me.id),
      ),
      lines: visible.map((l) =>
        lineView(
          l,
          canWrite && (l.group !== 'personal' || l.ownerMembershipId === me.id),
        ),
      ),
      privateAggregates: privateAggregates(lines, me.id).map(
        privateAggregateView,
      ),
      summary,
      actuals,
      flags: {
        incomesToConfirm: [
          ...new Set(
            incomes.filter((i) => i.toConfirm).map((i) => i.membershipId),
          ),
        ],
        linesNeedReview: visible.filter((l) => l.needsReview).map((l) => l.id),
        linesNeedIncome: visible.filter((l) => l.needsIncome).map((l) => l.id),
      },
      can: {
        editShared: canWrite,
        changeStatus: statusActions(month, me),
      },
    };
  }
}

function statusActions(month: BudgetMonth, me: Membership): MonthAction[] {
  if (month.status === 'draft' && can(me.role, 'months.activate'))
    return ['activate'];
  if (month.status === 'active' && can(me.role, 'months.close'))
    return ['close'];
  if (month.status === 'closed' && can(me.role, 'months.reopen'))
    return ['reopen'];
  return [];
}

export function lineView(l: BudgetLine, editable: boolean): LineView {
  return {
    id: l.id,
    seriesId: l.seriesId,
    group: l.group,
    kind: l.kind,
    label: l.label,
    categoryId: l.categoryId,
    isEnvelope: l.isEnvelope,
    subItems: l.subItems.map((s) => ({
      id: s.id,
      label: s.label,
      amountMinor: s.amountMinor?.toString() ?? null,
    })),
    ownerMembershipId: l.ownerMembershipId,
    isPrivate: l.isPrivate,
    splitMode: l.splitMode,
    payerMembershipId: l.payerMembershipId,
    totalMinor: l.totalMinor.toString(),
    shares: Object.entries(l.shares).map(([membershipId, amount]) => ({
      membershipId,
      amountMinor: amount.toString(),
    })),
    formula: l.formula
      ? {
          kind: l.formula.kind,
          baseMinor: l.formula.baseMinor.toString(),
          factor: l.formula.factor,
        }
      : null,
    position: l.position,
    version: l.version,
    isException: l.usual !== null,
    usualTotalMinor: l.usual?.totalMinor.toString() ?? null,
    needsReview: l.needsReview,
    needsIncome: l.needsIncome,
    editable,
  };
}

export function incomeView(i: IncomeLine, editable: boolean): IncomeLineView {
  return {
    id: i.id,
    membershipId: i.membershipId,
    label: i.label,
    amountMinor: i.amountMinor.toString(),
    countsTowardHousehold: i.countsTowardHousehold,
    toConfirm: i.toConfirm,
    isPrimary: i.isPrimary,
    position: i.position,
    version: i.version,
    editable,
  };
}
