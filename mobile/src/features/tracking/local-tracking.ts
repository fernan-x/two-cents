import type { MonthDetail, TrackingView } from '@two-cents/shared/contracts';
import {
  computeBalances,
  computeTracking,
  computeVouchers,
  type TrackLine,
  type Tx,
} from '@two-cents/shared/domain';

import type { LocalTransaction } from './mutations';

const str = (v: bigint) => v.toString();
const strOrNull = (v: bigint | null) => (v === null ? null : v.toString());

/** A visible transaction in the shape the shared tracking functions take. */
export function toTx(row: LocalTransaction): Tx | null {
  if (row.private) return null;
  return {
    id: row.id,
    date: row.date,
    amount: BigInt(row.amountMinor),
    payer: row.payer,
    method: row.paymentMethod,
    isPlanned: row.isPlanned,
    isShared: row.isShared,
    parts: row.parts.map((p) => ({ lineId: p.lineId, subItemId: p.subItemId, amount: BigInt(p.amountMinor) })),
  };
}

/**
 * Planned vs actual recomputed on the device (research R3, Principle II): the server's figures plus
 * what is still waiting to sync, with the same shared functions the server uses. Other members'
 * private lines come in as their "Privé" aggregates.
 */
export function localTracking(
  month: MonthDetail,
  rows: readonly LocalTransaction[],
  server: TrackingView | undefined,
): TrackingView {
  const lines: TrackLine[] = month.lines.map((l) => ({
    id: l.id,
    group: l.group,
    planned: BigInt(l.totalMinor),
    isEnvelope: l.isEnvelope,
    ownerMembershipId: l.ownerMembershipId,
    isPrivate: l.isPrivate,
    subItems: l.subItems.map((s) => ({ id: s.id, amount: s.amountMinor === null ? null : BigInt(s.amountMinor) })),
    shares: Object.fromEntries(l.shares.map((s) => [s.membershipId, BigInt(s.amountMinor)])),
  }));
  const privateLines: TrackLine[] = month.privateAggregates.map((p) => {
    const actual = server?.privateAggregates.find((a) => a.membershipId === p.membershipId)?.actualMinor ?? null;
    return {
      id: `private:${p.membershipId}`,
      group: 'personal',
      planned: BigInt(p.totalMinor),
      isEnvelope: false,
      ownerMembershipId: p.membershipId,
      isPrivate: true,
      subItems: [],
      shares: { [p.membershipId]: BigInt(p.totalMinor) },
      fixedActual: actual === null ? null : BigInt(actual),
    };
  });
  const txns = rows.map(toTx).filter((t): t is Tx => t !== null);
  const result = computeTracking({ lines: [...lines, ...privateLines], txns });
  const members = month.members.map((m) => ({ membershipId: m.membershipId, order: m.order }));
  const balances = computeBalances({
    members,
    txns,
    lines: Object.fromEntries(lines.map((l) => [l.id, { group: l.group, shares: l.shares }])),
    settlements: (server?.settlements ?? []).map((s) => ({ from: s.from, to: s.to, amount: BigInt(s.amountMinor) })),
  });
  const vouchers = computeVouchers({
    members,
    incomes: month.incomes.map((i) => ({ membershipId: i.membershipId, amount: BigInt(i.amountMinor), isMealVoucher: i.isMealVoucher })),
    txns,
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
    monthStart: month.month.start,
    status: month.month.status,
    revision: server?.revision ?? month.month.revision,
    lines: result.lines
      .filter((l) => !l.lineId.startsWith('private:'))
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
              subItems: l.envelope.subItems.map((s) => ({ subItemId: s.subItemId, spent: str(s.spent), remaining: strOrNull(s.remaining) })),
            }
          : null,
      })),
    privateAggregates: month.privateAggregates.map((p) => ({
      membershipId: p.membershipId,
      plannedMinor: p.totalMinor,
      actualMinor: server?.privateAggregates.find((a) => a.membershipId === p.membershipId)?.actualMinor ?? null,
    })),
    groups: (['personal', 'recurring_shared', 'one_off_shared'] as const).map((group) => ({ group, totals: totals(result.groups[group]) })),
    unassigned: {
      actual: str(result.unassigned.actual),
      txnCount: result.unassigned.txnCount,
      needsReviewCount: rows.filter((r) => !r.private && r.parts.some((p) => p.needsReview)).length,
    },
    month: totals(result.month),
    balances: balances.map((x) => ({ from: x.from, to: x.to, amountMinor: str(x.amount) })),
    settlements: server?.settlements ?? [],
    vouchers: vouchers.map((v) => ({
      membershipId: v.membershipId,
      incomeMinor: str(v.income),
      spentMinor: str(v.spent),
      remainingMinor: str(v.remaining),
    })),
  };
}
