import { parseBoundedAmount } from '../money';
import { categoryOf, isMealVoucher, isSavings, isTotalRow, sectionOf } from './keywords';
import { periodFromSheetName } from './sheet-name';
import { normalize } from './text';
import type { Cell, Grid, ImportMember, ProposedIncome, ProposedRow, ProposedSheet } from './types';

/**
 * One cell → exact minor units (Principle I). Numbers come from the spreadsheet as floats, so they
 * are read through their 2-decimal form and refused when they carry more precision; text goes
 * through the same parser as typed amounts, so "12,5" is 12,50 € (the spreadsheet's bug 1).
 */
export function cellAmount(cell: Cell): { amount: bigint | null; issue?: 'unreadable_amount' } {
  if (cell === null || cell === undefined || cell === '') return { amount: null };
  if (typeof cell === 'number') {
    const fixed = cell.toFixed(2);
    if (!Number.isFinite(cell) || cell < 0 || Math.abs(Number(fixed) - cell) > 1e-6)
      return { amount: null, issue: 'unreadable_amount' };
    const amount = parseBoundedAmount(fixed, 'EUR');
    return amount === null ? { amount: null, issue: 'unreadable_amount' } : { amount };
  }
  if (typeof cell === 'boolean') return { amount: null, issue: 'unreadable_amount' };
  const text = cell.replace(/€|eur/gi, '').trim();
  if (text === '') return { amount: null };
  const amount = parseBoundedAmount(text, 'EUR');
  return amount === null ? { amount: null, issue: 'unreadable_amount' } : { amount };
}

const text = (cell: Cell): string => (typeof cell === 'string' ? cell.trim() : cell === null ? '' : String(cell));

/**
 * A first proposal for one sheet (US8, research R16): the period from its name, member columns by
 * first name, groups from section rows, savings and categories from keywords, totals set apart.
 * The person corrects everything in the preview before anything is saved (FR-040).
 */
export function proposeSheetMapping(sheetName: string, grid: Grid, members: readonly ImportMember[]): ProposedSheet {
  const result: ProposedSheet = {
    sheetName,
    period: periodFromSheetName(sheetName),
    memberColumns: {},
    incomes: [],
    rows: [],
    sheetTotals: { whatsLeft: {} },
  };

  // Header row: the first row naming at least one member.
  const wanted = members.map((m) => ({ id: m.membershipId, name: normalize(m.firstName) }));
  let header = -1;
  for (let r = 0; r < grid.length && header < 0; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const cell = normalize(text(row[c]));
      const member = wanted.find((w) => w.name !== '' && cell === w.name);
      if (member && result.memberColumns[member.id] === undefined) {
        result.memberColumns[member.id] = c;
        header = r;
      }
    }
  }
  if (header < 0) return result;
  const columns = Object.entries(result.memberColumns);
  const amountCols = new Set(columns.map(([, c]) => c));
  const labelCol = (() => {
    for (let c = 0; c < (grid[header]?.length ?? 0) + 1; c++) if (!amountCols.has(c)) return c;
    return 0;
  })();

  let section: ReturnType<typeof sectionOf> = null;
  for (let r = header + 1; r < grid.length; r++) {
    const row = grid[r] ?? [];
    const label = text(row[labelCol] ?? null);
    const cells = columns.map(([id, c]) => [id, cellAmount(row[c] ?? null)] as const);
    const hasValues = columns.some(([, c]) => text(row[c] ?? null) !== '');

    const newSection = label ? sectionOf(label) : null;
    if (newSection && !hasValues) {
      section = newSection;
      continue;
    }
    if (!label && !hasValues) continue;
    const total = label ? isTotalRow(label) : null;
    if (total) {
      if (total === 'whatsLeft')
        for (const [id, value] of cells) result.sheetTotals.whatsLeft[id] = value.amount;
      continue;
    }
    if (section === 'income') {
      for (const [id, value] of cells)
        if (value.amount !== null && value.amount > 0n)
          result.incomes.push({
            membershipId: id,
            label: label || 'Revenu',
            amount: value.amount,
            counts: !isMealVoucher(label),
            rowIndex: r,
          } satisfies ProposedIncome);
      continue;
    }
    const issues: ProposedRow['issues'] = [];
    if (cells.some(([, v]) => v.issue)) issues.push('unreadable_amount');
    if (section === null) issues.push('unknown_group');
    result.rows.push({
      rowIndex: r,
      label: label || `Ligne ${r + 1}`,
      group: section,
      kind: isSavings(label) ? 'savings' : 'expense',
      categoryKey: categoryOf(label),
      amounts: Object.fromEntries(cells.map(([id, v]) => [id, v.amount])),
      issues,
    });
  }
  return result;
}
