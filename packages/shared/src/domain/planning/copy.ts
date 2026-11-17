import type { Formula } from './formula';
import { computeShares } from './split';
import type { Group, PlanIncome, PlanMember, SplitMode } from './types';

/** The amount fields of a line (research R7). */
export interface LineAmounts {
  totalMinor: bigint;
  splitMode: SplitMode | null;
  payerMembershipId: string | null;
  shares: Record<string, bigint>;
  formula: Formula | null;
}

export interface CopySource extends LineAmounts {
  group: Group;
  ownerMembershipId: string | null;
  /** Set when the line holds a "this month only" exception: its usual values. */
  usual: LineAmounts | null;
}

export interface Adapted {
  amounts: LineAmounts;
  /** A member's non-zero share was lost: someone must review the line (R8). */
  needsReview: boolean;
  /** Proportional line without counted income: shares kept as they were (R8). */
  needsIncome: boolean;
}

/** Fits a line's amounts to the contributing members of another month (research R8). */
export function adaptAmounts(
  line: Pick<CopySource, 'group' | 'ownerMembershipId' | keyof LineAmounts>,
  members: readonly PlanMember[],
  incomes: readonly PlanIncome[],
): Adapted {
  const ids = new Set(members.map((m) => m.membershipId));
  const base: LineAmounts = {
    totalMinor: line.totalMinor,
    splitMode: line.splitMode,
    payerMembershipId: line.payerMembershipId,
    shares: { ...line.shares },
    formula: line.formula,
  };

  if (line.group === 'personal') return { amounts: base, needsReview: false, needsIncome: false };

  if (line.splitMode === 'equal' || line.splitMode === 'proportional') {
    const anyIncome = incomes.some((i) => i.counts && i.amount > 0n && ids.has(i.membershipId));
    if (line.splitMode === 'proportional' && !anyIncome) {
      const kept = keepMembers(base.shares, ids);
      return {
        amounts: { ...base, shares: kept.shares, totalMinor: kept.total },
        needsReview: kept.lost,
        needsIncome: true,
      };
    }
    const { shares } = computeShares({ mode: line.splitMode, total: line.totalMinor, members, incomes });
    return { amounts: { ...base, shares }, needsReview: false, needsIncome: false };
  }

  if (line.splitMode === 'one_payer' && line.payerMembershipId && ids.has(line.payerMembershipId)) {
    const { shares } = computeShares({
      mode: 'one_payer',
      total: line.totalMinor,
      payerMembershipId: line.payerMembershipId,
      members,
      incomes,
    });
    return { amounts: { ...base, shares }, needsReview: false, needsIncome: false };
  }

  // custom, or a one-payer line whose payer is gone (it becomes custom so someone can fix it)
  const kept = keepMembers(base.shares, ids);
  return {
    amounts: {
      ...base,
      splitMode: 'custom',
      payerMembershipId: null,
      formula: kept.lost ? null : base.formula,
      shares: kept.shares,
      totalMinor: kept.total,
    },
    needsReview: kept.lost,
    needsIncome: false,
  };
}

function keepMembers(shares: Record<string, bigint>, ids: ReadonlySet<string>) {
  const out: Record<string, bigint> = {};
  let lost = false;
  for (const id of ids) out[id] = shares[id] ?? 0n;
  for (const [id, v] of Object.entries(shares)) if (!ids.has(id) && v > 0n) lost = true;
  const total = Object.values(out).reduce((s, v) => s + v, 0n);
  return { shares: out, total, lost };
}

export interface CopiedLine<T extends CopySource> extends Adapted {
  source: T;
}

/**
 * Lines of a new month from a source month or template (US2, research R14): recurring groups only
 * (plus one-off when asked), each at its usual value, fitted to the target month's members.
 * Personal lines of members not in the target month are dropped.
 */
export function copyLinesForNewMonth<T extends CopySource>(
  lines: readonly T[],
  members: readonly PlanMember[],
  incomes: readonly PlanIncome[],
  options: { includeOneOff: boolean },
): CopiedLine<T>[] {
  const ids = new Set(members.map((m) => m.membershipId));
  const out: CopiedLine<T>[] = [];
  for (const line of lines) {
    if (line.group === 'one_off_shared' && !options.includeOneOff) continue;
    if (line.group === 'personal' && !ids.has(line.ownerMembershipId ?? '')) continue;
    const usual = line.usual ?? line;
    const adapted = adaptAmounts(
      {
        group: line.group,
        ownerMembershipId: line.ownerMembershipId,
        totalMinor: usual.totalMinor,
        splitMode: usual.splitMode,
        payerMembershipId: usual.payerMembershipId,
        shares: usual.shares,
        formula: usual.formula,
      },
      members,
      incomes,
    );
    out.push({ source: line, ...adapted });
  }
  return out;
}
