import { normalizeLabel } from './suggest';

const DAY_MS = 86_400_000;
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS;

/**
 * Identifies one row of a bank export (R11), so re-importing a file is always detected. The
 * occurrence index tells two identical purchases of the same file apart. Plain text, not a hash:
 * every part is already stored on the transaction.
 */
export function importKey(payerKey: string, date: string, amount: bigint, rawLabel: string, occurrence: number): string {
  return `${payerKey}|${date}|${amount}|${normalizeLabel(rawLabel)}|${occurrence}`;
}

export interface DuplicateRow {
  rowId: string;
  date: string;
  amount: bigint;
  /** `joint` or `member:<membershipId>`. */
  payerKey: string;
  importKey: string;
}

export interface ExistingTxn {
  id: string;
  date: string;
  amount: bigint;
  payerKey: string;
  importKey: string | null;
}

/**
 * FR-042: a row is a possible duplicate of an existing transaction with the same amount and payer
 * dated within ±3 days; each existing transaction matches at most one row, closest dates first.
 * A row whose import key is already stored is "already imported".
 */
export function findDuplicates(
  rows: readonly DuplicateRow[],
  existing: readonly ExistingTxn[],
): Map<string, { duplicateOf: string | null; alreadyImported: boolean }> {
  const result = new Map<string, { duplicateOf: string | null; alreadyImported: boolean }>();
  const used = new Set<string>();
  for (const row of rows) {
    const same = existing.find((e) => e.importKey !== null && e.importKey === row.importKey);
    if (same) {
      used.add(same.id);
      result.set(row.rowId, { duplicateOf: same.id, alreadyImported: true });
    }
  }
  const pairs: { row: DuplicateRow; ex: ExistingTxn; days: number; order: number }[] = [];
  rows.forEach((row, order) => {
    if (result.has(row.rowId)) return;
    for (const ex of existing) {
      if (ex.amount !== row.amount || ex.payerKey !== row.payerKey) continue;
      const days = dayDiff(ex.date, row.date);
      if (days <= 3) pairs.push({ row, ex, days, order });
    }
  });
  pairs.sort((a, b) => a.days - b.days || a.order - b.order);
  for (const p of pairs) {
    if (result.has(p.row.rowId) || used.has(p.ex.id)) continue;
    used.add(p.ex.id);
    result.set(p.row.rowId, { duplicateOf: p.ex.id, alreadyImported: false });
  }
  for (const row of rows) if (!result.has(row.rowId)) result.set(row.rowId, { duplicateOf: null, alreadyImported: false });
  return result;
}
