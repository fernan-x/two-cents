import { Inject, Injectable } from '@nestjs/common';
import type {
  PersonRef,
  SettlementView,
  TrackingView,
  TransactionView,
} from '@two-cents/shared/contracts';
import {
  can,
  computeBalances,
  computeTracking,
  computeVouchers,
  type TrackLine,
} from '@two-cents/shared/domain';
import { BudgetViews } from '../../../budgets/application/services/budget-views';
import type { Budget } from '../../../budgets/domain/entities/budget';
import type { Membership } from '../../../budgets/domain/entities/membership';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../budgets/domain/ports/repositories';
import {
  contributingMembers,
  toPlanMembers,
} from '../../../planning/application/services/plan-mapping';
import type { BudgetLine } from '../../../planning/domain/entities/budget-line';
import type { BudgetMonth } from '../../../planning/domain/entities/budget-month';
import type { IncomeLine } from '../../../planning/domain/entities/income-line';
import {
  payerOf,
  toTx,
  type TxnRecord,
} from '../../domain/entities/transaction';
import type { SettlementRecord } from '../../domain/ports/repositories';

const str = (v: bigint) => v.toString();
const strOrNull = (v: bigint | null) => (v === null ? null : v.toString());

/** The line owner of a transaction on a personal line, if any. */
export function personalOwner(
  txn: TxnRecord,
  lines: readonly BudgetLine[],
): string | null {
  for (const p of txn.parts) {
    const line = lines.find((l) => l.id === p.lineId);
    if (line?.group === 'personal') return line.ownerMembershipId;
  }
  return null;
}

/** Another member's private line (FR-048): the transaction is shown only as "Privé". */
export function hiddenFrom(
  txn: TxnRecord,
  lines: readonly BudgetLine[],
  viewer: string,
): string | null {
  for (const p of txn.parts) {
    const line = lines.find((l) => l.id === p.lineId);
    if (line?.isPrivate && line.ownerMembershipId !== viewer)
      return line.ownerMembershipId;
  }
  return null;
}

export const toTrackLine = (l: BudgetLine): TrackLine => ({
  id: l.id,
  group: l.group,
  planned: l.totalMinor,
  isEnvelope: l.isEnvelope,
  ownerMembershipId: l.ownerMembershipId,
  isPrivate: l.isPrivate,
  subItems: l.subItems.map((s) => ({ id: s.id, amount: s.amountMinor })),
  shares: l.shares,
});

/**
 * Builds transaction and tracking views for one person. Every figure comes from the shared
 * tracking functions (Principle II); other members' private lines and their transactions are
 * never serialized (FR-048, Principle III).
 */
@Injectable()
export class TrackingViews {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    private readonly people: BudgetViews,
  ) {}

  async refs(budgetId: string): Promise<Map<string, PersonRef>> {
    return this.people.personRefs(
      await this.memberships.listByBudget(budgetId),
    );
  }

  transaction(
    txn: TxnRecord,
    me: Membership,
    month: BudgetMonth,
    lines: readonly BudgetLine[],
    refs: Map<string, PersonRef>,
  ): TransactionView {
    const owner = hiddenFrom(txn, lines, me.id);
    if (owner)
      return {
        private: true,
        id: txn.id,
        monthStart: month.periodStart,
        date: txn.date,
        ownerMembershipId: owner,
      };
    const personal = personalOwner(txn, lines);
    const writable =
      month.status !== 'closed' &&
      can(me.role, 'transactions.write') &&
      (personal === null || personal === me.id);
    return {
      private: false,
      id: txn.id,
      monthStart: month.periodStart,
      date: txn.date,
      amountMinor: str(txn.amountMinor),
      currency: txn.currency,
      isRefund: txn.isRefund,
      label: txn.label,
      payer: payerOf(txn),
      paymentMethod: txn.paymentMethod,
      isPlanned: txn.isPlanned,
      isShared: txn.isShared,
      note: txn.note,
      parts: txn.parts.map((p) => ({
        id: p.id,
        lineId: p.lineId,
        subItemId: p.subItemId,
        amountMinor: str(p.amountMinor),
        needsReview: p.needsReview,
      })),
      receipts: txn.receipts.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
      })),
      origin: txn.origin,
      recurringRuleId: txn.recurringRuleId,
      version: txn.version,
      createdAt: txn.createdAt.toISOString(),
      createdBy: txn.createdBy ? (refs.get(txn.createdBy) ?? null) : null,
      updatedAt: txn.updatedAt.toISOString(),
      updatedBy: txn.updatedBy ? (refs.get(txn.updatedBy) ?? null) : null,
      can: { edit: writable, delete: writable },
    };
  }

  settlement(
    s: SettlementRecord,
    refs: Map<string, PersonRef>,
  ): SettlementView {
    return {
      id: s.id,
      from: s.fromMembershipId,
      to: s.toMembershipId,
      amountMinor: str(s.amountMinor),
      createdAt: s.createdAt.toISOString(),
      createdBy: s.createdBy ? (refs.get(s.createdBy) ?? null) : null,
    };
  }

  /** Open balances between members for the month (FR-030). */
  balances(
    budget: Budget,
    all: readonly Membership[],
    month: BudgetMonth,
    lines: readonly BudgetLine[],
    txns: readonly TxnRecord[],
    settlements: readonly SettlementRecord[],
  ) {
    const members = contributingMembers(budget, all, month.period);
    return computeBalances({
      members: toPlanMembers(members),
      txns: txns.map(toTx),
      lines: Object.fromEntries(
        lines.map((l) => [l.id, { group: l.group, shares: l.shares }]),
      ),
      settlements: settlements.map((s) => ({
        from: s.fromMembershipId,
        to: s.toMembershipId,
        amount: s.amountMinor,
      })),
    });
  }

  async tracking(input: {
    budget: Budget;
    me: Membership;
    month: BudgetMonth;
    lines: readonly BudgetLine[];
    incomes: readonly IncomeLine[];
    txns: readonly TxnRecord[];
    settlements: readonly SettlementRecord[];
  }): Promise<TrackingView> {
    const { budget, me, month, lines, incomes, txns, settlements } = input;
    const all = await this.memberships.listByBudget(budget.id);
    const refs = await this.people.personRefs(all);
    const members = contributingMembers(budget, all, month.period);
    const result = computeTracking({
      lines: lines.map(toTrackLine),
      txns: txns.map(toTx),
    });
    const visible = new Set(
      lines
        .filter((l) => !l.isPrivate || l.ownerMembershipId === me.id)
        .map((l) => l.id),
    );
    const balances = this.balances(
      budget,
      all,
      month,
      lines,
      txns,
      settlements,
    );
    const vouchers = computeVouchers({
      members: toPlanMembers(members),
      incomes: incomes.map((i) => ({
        membershipId: i.membershipId,
        amount: i.amountMinor,
        isMealVoucher: i.isMealVoucher,
      })),
      txns: txns.map(toTx),
    });
    const totals = (t: (typeof result)['month']) => ({
      plannedAll: str(t.plannedAll),
      plannedTracked: str(t.plannedTracked),
      actual: str(t.actual),
      difference: str(t.difference),
      differencePermille: t.differencePermille,
      notTrackedCount: t.notTrackedCount,
    });
    return {
      monthStart: month.periodStart,
      status: month.status,
      revision: month.revision.toString(),
      lines: result.lines
        .filter((l) => visible.has(l.lineId))
        .map((l) => ({
          lineId: l.lineId,
          group: l.group,
          planned: str(l.planned),
          actual: strOrNull(l.actual),
          difference: strOrNull(l.difference),
          differencePermille: l.differencePermille,
          txnCount: l.txnCount,
          envelope: l.envelope
            ? {
                spent: str(l.envelope.spent),
                remaining: str(l.envelope.remaining),
                over: str(l.envelope.over),
                progressPermille: l.envelope.progressPermille,
                level: l.envelope.level,
                subItems: l.envelope.subItems.map((s) => ({
                  subItemId: s.subItemId,
                  spent: str(s.spent),
                  remaining: strOrNull(s.remaining),
                })),
              }
            : null,
        })),
      privateAggregates: [...result.privateByOwner.entries()]
        .filter(([owner]) => owner !== me.id)
        .map(([membershipId, agg]) => ({
          membershipId,
          plannedMinor: str(agg.planned),
          actualMinor: strOrNull(agg.actual),
        })),
      groups: (['personal', 'recurring_shared', 'one_off_shared'] as const).map(
        (group) => ({ group, totals: totals(result.groups[group]) }),
      ),
      unassigned: {
        actual: str(result.unassigned.actual),
        txnCount: result.unassigned.txnCount,
        needsReviewCount: txns.filter((t) => t.parts.some((p) => p.needsReview))
          .length,
      },
      month: totals(result.month),
      balances: balances.map((b) => ({
        from: b.from,
        to: b.to,
        amountMinor: str(b.amount),
      })),
      settlements: settlements.map((s) => this.settlement(s, refs)),
      vouchers: vouchers.map((v) => ({
        membershipId: v.membershipId,
        incomeMinor: str(v.income),
        spentMinor: str(v.spent),
        remainingMinor: str(v.remaining),
      })),
    };
  }
}
