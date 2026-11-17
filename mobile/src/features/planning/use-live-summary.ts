import type { Group, Kind, MonthDetail, MonthSummaryView } from '@two-cents/shared/contracts';
import { computeMonthSummary, type PlanLine } from '@two-cents/shared/domain';
import { useMemo } from 'react';

/** An unsaved line edit: replaces the line with the same id, or is added when `id` is absent. */
export interface LineDraft {
  id?: string;
  group: Group;
  kind: Kind;
  shares: readonly { membershipId: string; amountMinor: string }[];
}

/** An unsaved income edit: replaces the income with the same id, or is added when `id` is absent. */
export interface IncomeDraft {
  id?: string;
  membershipId: string;
  amountMinor: string;
  countsTowardHousehold: boolean;
}

export type Draft = { line: LineDraft } | { income: IncomeDraft } | null;

const toLine = (l: LineDraft): PlanLine => {
  const shares: Record<string, bigint> = {};
  let total = 0n;
  for (const s of l.shares) {
    const v = BigInt(s.amountMinor);
    shares[s.membershipId] = v;
    total += v;
  }
  return { group: l.group, kind: l.kind, total, shares };
};

/**
 * The month summary with an unsaved edit applied (FR-031): the same shared function the API uses
 * (Principle II), so the figure shown while typing is the one the server will store.
 */
export function liveSummary(detail: MonthDetail, draft: Draft = null): MonthSummaryView {
  const lineDrafts: LineDraft[] = detail.lines
    .filter((l) => !(draft && 'line' in draft && draft.line.id === l.id))
    .map((l) => ({ id: l.id, group: l.group, kind: l.kind, shares: l.shares }));
  if (draft && 'line' in draft) lineDrafts.push(draft.line);

  const incomes = detail.incomes
    .filter((i) => !(draft && 'income' in draft && draft.income.id === i.id))
    .map((i) => ({ membershipId: i.membershipId, amount: BigInt(i.amountMinor), counts: i.countsTowardHousehold }));
  if (draft && 'income' in draft)
    incomes.push({
      membershipId: draft.income.membershipId,
      amount: BigInt(draft.income.amountMinor),
      counts: draft.income.countsTowardHousehold,
    });

  const s = computeMonthSummary({
    members: detail.members.map((m) => ({ membershipId: m.membershipId, order: m.order })),
    incomes,
    lines: lineDrafts.map(toLine),
    privateAggregates: detail.privateAggregates.map((p) => ({
      membershipId: p.membershipId,
      total: BigInt(p.totalMinor),
      savings: BigInt(p.savingsMinor),
    })),
  });
  return {
    members: s.members.map((m) => ({
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
      countedIncomeMinor: s.household.countedIncome.toString(),
      otherIncomeMinor: s.household.otherIncome.toString(),
      plannedMinor: s.household.planned.toString(),
      whatsLeftMinor: s.household.whatsLeft.toString(),
      transferMinor: s.household.transfer.toString(),
      savingsMinor: s.household.savings.toString(),
    },
  };
}

/**
 * Live summary for a screen. Without a draft the server's summary is shown as is (it may be the
 * frozen summary of a closed month, FR-036).
 */
export function useLiveSummary(detail: MonthDetail | undefined, draft: Draft = null): MonthSummaryView | undefined {
  return useMemo(() => {
    if (!detail) return undefined;
    if (!draft || detail.month.status === 'closed') return detail.summary;
    return liveSummary(detail, draft);
  }, [detail, draft]);
}
