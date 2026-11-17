import { byOrder, type PlanIncome, type PlanLine, type PlanMember, type PrivateAggregate } from './types';

export interface MemberSummary {
  membershipId: string;
  countedIncome: bigint;
  otherIncome: bigint;
  di: bigint;
  dcr: bigint;
  dce: bigint;
  /** Signed: negative means the member's plan overruns their income. */
  whatsLeft: bigint;
  transfer: bigint;
  savings: bigint;
  /** Tenths of a percent (141 = 14,1 %), null without counted income. */
  savingsRatePermille: number | null;
  overrun: boolean;
}

export interface HouseholdSummary {
  countedIncome: bigint;
  otherIncome: bigint;
  planned: bigint;
  whatsLeft: bigint;
  transfer: bigint;
  savings: bigint;
}

export interface MonthSummary {
  members: MemberSummary[];
  household: HouseholdSummary;
}

export interface SummaryInput {
  members: readonly PlanMember[];
  incomes: readonly PlanIncome[];
  lines: readonly PlanLine[];
  privateAggregates: readonly PrivateAggregate[];
}

/** savings ÷ income in tenths of a percent, half-up; integers only (Principle I). */
export function savingsRatePermille(savings: bigint, income: bigint): number | null {
  if (income <= 0n) return null;
  return Number((savings * 2000n + income) / (2n * income));
}

/**
 * Every figure of a month (FR-028–FR-030). Each line is visited once and each share is added to
 * exactly one group total, so nothing can be left out (the spreadsheet bugs, spec).
 */
export function computeMonthSummary(input: SummaryInput): MonthSummary {
  const rows = new Map(
    byOrder(input.members).map((m) => [
      m.membershipId,
      { countedIncome: 0n, otherIncome: 0n, di: 0n, dcr: 0n, dce: 0n, savings: 0n },
    ]),
  );

  for (const income of input.incomes) {
    const row = rows.get(income.membershipId);
    if (!row) continue;
    if (income.counts) row.countedIncome += income.amount;
    else row.otherIncome += income.amount;
  }

  for (const line of input.lines) {
    for (const [membershipId, share] of Object.entries(line.shares)) {
      const row = rows.get(membershipId);
      if (!row) continue;
      if (line.group === 'personal') row.di += share;
      else if (line.group === 'recurring_shared') row.dcr += share;
      else row.dce += share;
      if (line.kind === 'savings') row.savings += share;
    }
  }

  for (const p of input.privateAggregates) {
    const row = rows.get(p.membershipId);
    if (!row) continue;
    row.di += p.total;
    row.savings += p.savings;
  }

  const household: HouseholdSummary = {
    countedIncome: 0n,
    otherIncome: 0n,
    planned: 0n,
    whatsLeft: 0n,
    transfer: 0n,
    savings: 0n,
  };
  const members: MemberSummary[] = [];
  for (const [membershipId, r] of rows) {
    const whatsLeft = r.countedIncome - r.di - r.dcr - r.dce;
    const transfer = r.dcr + r.dce;
    members.push({
      membershipId,
      countedIncome: r.countedIncome,
      otherIncome: r.otherIncome,
      di: r.di,
      dcr: r.dcr,
      dce: r.dce,
      whatsLeft,
      transfer,
      savings: r.savings,
      savingsRatePermille: savingsRatePermille(r.savings, r.countedIncome),
      overrun: whatsLeft < 0n,
    });
    household.countedIncome += r.countedIncome;
    household.otherIncome += r.otherIncome;
    household.planned += r.di + r.dcr + r.dce;
    household.whatsLeft += whatsLeft;
    household.transfer += transfer;
    household.savings += r.savings;
  }
  return { members, household };
}
