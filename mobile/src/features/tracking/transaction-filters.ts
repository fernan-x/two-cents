import type { LineView } from '@two-cents/shared/contracts';
import { normalizeLabel } from '@two-cents/shared/domain';

import type { LocalTransaction } from './mutations';

export interface TransactionFilters {
  /** Member involved: payer, or owner of a personal line the transaction is on. */
  member?: string | null;
  /** `joint` or a membership id. */
  payer?: string | null;
  lineId?: string | null;
  group?: 'personal' | 'recurring_shared' | 'one_off_shared' | 'unassigned' | null;
  planned?: boolean | null;
  pendingOnly?: boolean;
  search?: string;
}

/**
 * The month list's filters (FR-017), done on the device so they work offline: all filters combine
 * (AND), label search ignores case and accents. Returns the rows and the total of what is listed.
 */
export function filterTransactions(
  rows: readonly LocalTransaction[],
  lines: readonly LineView[],
  f: TransactionFilters,
): { rows: LocalTransaction[]; totalMinor: string } {
  const wanted = f.search ? normalizeLabel(f.search) : '';
  const lineOf = (id: string | null) => (id ? lines.find((l) => l.id === id) : undefined);
  const out = rows.filter((r) => {
    if (r.private) return !(f.payer || f.lineId || f.group || f.planned != null || f.pendingOnly || wanted) && (!f.member || f.member === r.ownerMembershipId);
    if (f.pendingOnly && !r._pending) return false;
    const payer = r.payer.kind === 'joint' ? 'joint' : r.payer.membershipId;
    if (f.payer && payer !== f.payer) return false;
    if (f.member) {
      const owners = r.parts.map((p) => lineOf(p.lineId)?.ownerMembershipId).filter(Boolean);
      if (payer !== f.member && !owners.includes(f.member)) return false;
    }
    if (f.lineId && !r.parts.some((p) => p.lineId === f.lineId)) return false;
    if (f.group) {
      const groups = r.parts.length ? r.parts.map((p) => lineOf(p.lineId)?.group ?? 'unassigned') : ['unassigned'];
      if (!groups.includes(f.group)) return false;
    }
    if (f.planned != null && r.isPlanned !== f.planned) return false;
    if (wanted && !normalizeLabel(r.label).includes(wanted)) return false;
    return true;
  });
  let total = 0n;
  for (const r of out) if (!r.private) total += BigInt(r.amountMinor);
  return { rows: out, totalMinor: total.toString() };
}

/** Rows grouped by day, newest first (list sections). */
export function byDay(rows: readonly LocalTransaction[]): { date: string; rows: LocalTransaction[] }[] {
  const days = new Map<string, LocalTransaction[]>();
  for (const r of rows) days.set(r.date, [...(days.get(r.date) ?? []), r]);
  return [...days.entries()].sort(([a], [b]) => (a < b ? 1 : -1)).map(([date, list]) => ({ date, rows: list }));
}
