import type { LineView, TransactionHints, TransactionImportResult } from '@two-cents/shared/contracts';
import { type CsvRow, importKey, stripBankNoise, suggestLine } from '@two-cents/shared/domain';

/** One row of the review screen (US9, FR-041). */
export interface ReviewRow {
  rowId: string;
  importKey: string;
  date: string | null;
  label: string;
  direction: 'debit' | 'credit';
  amountMinor: string | null;
  lineId: string | null;
  include: boolean;
  /** Set by the dry run. */
  duplicateOf: string | null;
  alreadyImported: boolean;
  monthStatus: 'open' | 'closed' | 'missing';
  error: 'UNREADABLE_DATE' | 'UNREADABLE_AMOUNT' | null;
}

/**
 * Turns read CSV rows into review rows: debits included as expenses, credits excluded and proposed
 * as refunds (FR-041), a line suggested from the bank label without its noise (R11).
 */
export function buildReviewRows(
  rows: readonly CsvRow[],
  options: { payerKey: string; lines: readonly LineView[]; hints: TransactionHints | undefined; newId: () => string },
): ReviewRow[] {
  const seen = new Map<string, number>();
  const refs = options.lines.map((l) => ({ id: l.id, seriesId: l.seriesId, group: l.group, ownerMembershipId: l.ownerMembershipId }));
  return rows.map((r) => {
    const signed = r.amountMinor === null ? null : r.direction === 'debit' ? r.amountMinor : -r.amountMinor;
    const base = `${r.date}|${signed}|${r.label}`;
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    const cleaned = stripBankNoise(r.label);
    const lineId = options.hints && cleaned ? suggestLine(cleaned, options.hints.labels, refs) : null;
    return {
      rowId: options.newId(),
      importKey: importKey(options.payerKey, r.date ?? '-', signed ?? 0n, r.label, occurrence),
      date: r.date,
      label: r.label.slice(0, 60) || cleaned.slice(0, 60) || '?',
      direction: r.direction,
      amountMinor: signed === null ? null : signed.toString(),
      lineId,
      include: r.error === null && r.direction === 'debit',
      duplicateOf: null,
      alreadyImported: false,
      monthStatus: 'open',
      error: r.error,
    };
  });
}

/** Applies the dry run: possible duplicates and already-imported rows are unchecked (FR-042). */
export function applyDryRun(rows: readonly ReviewRow[], result: TransactionImportResult): ReviewRow[] {
  return rows.map((r) => {
    const x = result.rows.find((y) => y.rowId === r.rowId);
    if (!x) return r;
    const flagged = x.duplicateOf !== null || x.alreadyImported;
    return {
      ...r,
      duplicateOf: x.duplicateOf,
      alreadyImported: x.alreadyImported,
      monthStatus: x.monthStatus,
      include: r.include && !flagged && x.monthStatus !== 'missing',
    };
  });
}

/** Confirm is possible when every unreadable row is skipped and something is included (FR-043). */
export function canConfirm(rows: readonly ReviewRow[]): boolean {
  return rows.some((r) => r.include) && rows.every((r) => !r.include || (r.error === null && r.monthStatus !== 'missing'));
}

/** What goes to `POST …/transaction-imports` for a dry run or the commit. */
export function toRequestRows(rows: readonly ReviewRow[]) {
  return rows
    .filter((r) => r.error === null && r.date && r.amountMinor)
    .map((r) => ({
      rowId: r.rowId,
      importKey: r.importKey,
      date: r.date!,
      amountMinor: r.amountMinor!,
      label: r.label,
      parts: r.lineId ? [{ lineId: r.lineId, amountMinor: r.amountMinor! }] : [],
      isPlanned: r.lineId !== null,
      include: r.include,
    }));
}
