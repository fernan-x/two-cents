import { GROUPS, type Group } from '../planning/types';
import { envelopeState, subItemState } from './envelope';
import type { LineTracking, Totals, TrackLine, Tx } from './types';

/** n / d in thousandths, rounded half away from zero, as an integer. Null when d is 0. No floats. */
export function permille(n: bigint, d: bigint): number | null {
  if (d === 0n) return null;
  const negative = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const value = (an * 2000n + ad) / (2n * ad);
  return Number(negative ? -value : value);
}

export interface LineActuals {
  byLine: Map<string, { actual: bigint; txnCount: number }>;
  bySubItem: Map<string, bigint>;
  unassigned: { actual: bigint; txnCount: number };
}

/** Sums transaction parts per line (refunds subtract). A line with no part is absent. */
export function lineActuals(txns: readonly Tx[]): LineActuals {
  const byLine = new Map<string, { actual: bigint; txnCount: number }>();
  const bySubItem = new Map<string, bigint>();
  const unassigned = { actual: 0n, txnCount: 0 };
  for (const t of txns) {
    if (t.parts.length === 0) {
      unassigned.actual += t.amount;
      unassigned.txnCount += 1;
      continue;
    }
    const seen = new Set<string>();
    for (const p of t.parts) {
      if (p.lineId === null) {
        unassigned.actual += p.amount;
        if (!seen.has('')) unassigned.txnCount += 1;
        seen.add('');
        continue;
      }
      const entry = byLine.get(p.lineId) ?? { actual: 0n, txnCount: 0 };
      entry.actual += p.amount;
      if (!seen.has(p.lineId)) entry.txnCount += 1;
      seen.add(p.lineId);
      byLine.set(p.lineId, entry);
      if (p.subItemId) bySubItem.set(p.subItemId, (bySubItem.get(p.subItemId) ?? 0n) + p.amount);
    }
  }
  return { byLine, bySubItem, unassigned };
}

export interface TrackingResult {
  lines: LineTracking[];
  groups: Record<Group, Totals>;
  unassigned: { actual: bigint; txnCount: number };
  month: Totals;
  /** Planned and actual of private lines, per owner (to show others one "Privé" row, FR-048). */
  privateByOwner: Map<string, { planned: bigint; actual: bigint | null }>;
}

const emptyTotals = (): Totals => ({
  plannedAll: 0n,
  plannedTracked: 0n,
  actual: 0n,
  difference: 0n,
  differencePermille: null,
  notTrackedCount: 0,
});

function addLine(t: Totals, planned: bigint, actual: bigint | null): void {
  t.plannedAll += planned;
  if (actual === null) t.notTrackedCount += 1;
  else {
    t.plannedTracked += planned;
    t.actual += actual;
  }
}

function close(t: Totals): Totals {
  t.difference = t.actual - t.plannedTracked;
  t.differencePermille = permille(t.difference, t.plannedTracked);
  return t;
}

/**
 * Planned vs actual per line, group and month (FR-022–FR-024). Lines without transactions are
 * "not tracked": left out of actual and difference, counted in `notTrackedCount`. Unassigned
 * spending is in the month actual but in no group.
 */
export function computeTracking(input: { lines: readonly TrackLine[]; txns: readonly Tx[] }): TrackingResult {
  const sums = lineActuals(input.txns);
  const groups = Object.fromEntries(GROUPS.map((g) => [g, emptyTotals()])) as Record<Group, Totals>;
  const month = emptyTotals();
  const privateByOwner = new Map<string, { planned: bigint; actual: bigint | null }>();

  const lines = input.lines.map((line): LineTracking => {
    const summed = sums.byLine.get(line.id);
    const actual = line.fixedActual !== undefined ? line.fixedActual : (summed?.actual ?? null);
    addLine(groups[line.group], line.planned, actual);
    addLine(month, line.planned, actual);
    if (line.isPrivate && line.ownerMembershipId) {
      const agg = privateByOwner.get(line.ownerMembershipId) ?? { planned: 0n, actual: null };
      agg.planned += line.planned;
      if (actual !== null) agg.actual = (agg.actual ?? 0n) + actual;
      privateByOwner.set(line.ownerMembershipId, agg);
    }
    const difference = actual === null ? null : actual - line.planned;
    return {
      lineId: line.id,
      group: line.group,
      planned: line.planned,
      actual,
      difference,
      differencePermille: difference === null ? null : permille(difference, line.planned),
      txnCount: summed?.txnCount ?? 0,
      envelope: line.isEnvelope
        ? {
            ...envelopeState(line.planned, actual ?? 0n),
            subItems: line.subItems.map((s) => ({
              subItemId: s.id,
              ...subItemState(s.amount, sums.bySubItem.get(s.id) ?? 0n),
            })),
          }
        : null,
    };
  });

  for (const g of GROUPS) close(groups[g]);
  month.actual += sums.unassigned.actual;
  close(month);
  return { lines, groups, unassigned: sums.unassigned, month, privateByOwner };
}
