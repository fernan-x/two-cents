import type { Category, ImportRequest } from '@two-cents/shared/contracts';
import {
  budgetMonthFor,
  type CategoryKey,
  type Group,
  type Kind,
  monthLabelFor,
  parseBoundedAmount,
  type ProposedRow,
  type ProposedSheet,
  toImportMonth,
} from '@two-cents/shared/domain';

/** What the person changed on one row in the preview (FR-040). */
export interface RowEdit {
  group?: Group;
  kind?: Kind;
  categoryKey?: CategoryKey | null;
  /** membershipId → amount as typed; read with the same parser as every amount field (FR-026). */
  amountTexts?: Record<string, string>;
  skipped?: boolean;
}

/** One sheet under review. */
export interface SheetState {
  sheet: ProposedSheet;
  /** Start of the budget month the sheet becomes, or null while unknown. */
  periodStart: string | null;
  skipped: boolean;
  edits: Record<number, RowEdit>;
}

/**
 * Start of the budget month named after `{year, month}` (research R1: a period is named after the
 * calendar month holding most of its days), for a budget whose months start on `startDay`.
 * Limitation: start-day changes in the budget's history (transition months) are ignored; the server
 * refuses such a period with INVALID_MONTH and the person picks another one.
 */
export function periodStartFor(period: { year: number; month: number }, startDay: number): string {
  const rules = [{ effectiveFrom: '1900-01-01', startDay }];
  const pad = (n: number) => String(n).padStart(2, '0');
  const candidates = [0, -1].map((offset) => {
    const d = new Date(Date.UTC(period.year, period.month - 1 + offset, startDay));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  });
  for (const start of candidates) {
    const label = monthLabelFor(budgetMonthFor(start, rules));
    if (label.year === period.year && label.month === period.month) return start;
  }
  return candidates[0];
}

/** The row as reviewed: edits applied, issues recomputed. */
export function effectiveRow(row: ProposedRow, edit: RowEdit | undefined, currency: string): ProposedRow {
  if (!edit) return row;
  const amounts = { ...row.amounts };
  let unreadable = row.issues.includes('unreadable_amount');
  if (edit.amountTexts) {
    unreadable = false;
    for (const id of Object.keys(row.amounts)) {
      const text = edit.amountTexts[id];
      // Once the person edits a row's amounts, the typed values replace what was read; an
      // untouched cell keeps its value (an unreadable cell was null and stays empty).
      if (text === undefined) continue;
      if (text.trim() === '') {
        amounts[id] = null;
        continue;
      }
      const parsed = parseBoundedAmount(text, currency);
      amounts[id] = parsed;
      if (parsed === null) unreadable = true;
    }
  }
  const group = edit.group ?? row.group;
  const issues: ProposedRow['issues'] = [];
  if (unreadable) issues.push('unreadable_amount');
  if (group === null) issues.push('unknown_group');
  return {
    ...row,
    group,
    kind: edit.kind ?? row.kind,
    categoryKey: edit.categoryKey !== undefined ? edit.categoryKey : row.categoryKey,
    amounts,
    issues,
  };
}

export function effectiveSheet(state: SheetState, currency: string): ProposedSheet {
  return { ...state.sheet, rows: state.sheet.rows.map((r) => effectiveRow(r, state.edits[r.rowIndex], currency)) };
}

const skippedRows = (state: SheetState) =>
  new Set(Object.entries(state.edits).filter(([, e]) => e.skipped).map(([i]) => Number(i)));

/** Rows that still have an issue and are not skipped: they block the import (FR-041). */
export function blockingRows(state: SheetState, currency: string): ProposedRow[] {
  if (state.skipped) return [];
  const skipped = skippedRows(state);
  return effectiveSheet(state, currency).rows.filter((r) => !skipped.has(r.rowIndex) && r.issues.length > 0);
}

/** Why the sheets cannot be imported yet, or null when they can. */
export function importBlocker(states: SheetState[], currency: string): 'nothing' | 'rows' | 'period' | null {
  const included = states.filter((s) => !s.skipped);
  if (included.length === 0) return 'nothing';
  if (included.some((s) => s.periodStart === null)) return 'period';
  if (included.some((s) => blockingRows(s, currency).length > 0)) return 'rows';
  return null;
}

/**
 * The request body for `POST /imports` (contracts `ImportRequest`, without `dryRun`): included sheets
 * that have a period and no blocking row. Category keys become this budget's category ids (default
 * categories by `systemKey`); an unknown key leaves the line uncategorized.
 */
export function buildImportRequest(
  states: SheetState[],
  categories: Category[],
  currency: string,
): Omit<ImportRequest, 'dryRun'> {
  const idByKey = new Map(categories.filter((c) => c.systemKey).map((c) => [c.systemKey as string, c.id]));
  const months = states
    .filter((s) => !s.skipped && s.periodStart !== null && blockingRows(s, currency).length === 0)
    .map((s) => {
      const draft = toImportMonth(effectiveSheet(s, currency), s.periodStart!, skippedRows(s));
      return {
        periodStart: draft.periodStart,
        incomes: draft.incomes,
        lines: draft.lines.map(({ categoryKey, ...line }) => ({
          ...line,
          categoryId: categoryKey ? (idByKey.get(categoryKey) ?? null) : null,
        })),
      };
    });
  return { months };
}
