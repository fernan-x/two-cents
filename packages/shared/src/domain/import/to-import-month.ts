import type { Group, Kind } from '../planning/types';
import type { CategoryKey, ProposedSheet } from './types';

/** A line ready for `POST /imports` (contracts `ImportMonth.lines`), category as a key to resolve. */
export interface ImportLineDraft {
  group: Group;
  kind: Kind;
  label: string;
  categoryKey: CategoryKey | null;
  ownerMembershipId?: string;
  split?: { mode: 'custom' };
  amount:
    | { entry: 'total'; totalMinor: string }
    | { entry: 'shares'; shares: Array<{ membershipId: string; amountMinor: string }> };
}

export interface ImportMonthDraft {
  periodStart: string;
  incomes: Array<{ membershipId: string; label: string; amountMinor: string; countsTowardHousehold: boolean }>;
  lines: ImportLineDraft[];
}

/**
 * The reviewed sheet as one month to import. A personal row becomes one personal line per member
 * with an amount; a shared row becomes a custom split. Rows in `skipped` are left out; a row still
 * holding an issue must be fixed or skipped before this is called (FR-041).
 */
export function toImportMonth(sheet: ProposedSheet, periodStart: string, skipped: ReadonlySet<number>): ImportMonthDraft {
  const lines: ImportLineDraft[] = [];
  for (const row of sheet.rows) {
    if (skipped.has(row.rowIndex)) continue;
    if (row.issues.length > 0 || row.group === null)
      throw new Error(`row ${row.rowIndex} still needs review`);
    const amounts = Object.entries(row.amounts).filter((e): e is [string, bigint] => e[1] !== null);
    if (row.group === 'personal') {
      for (const [membershipId, amount] of amounts)
        if (amount > 0n)
          lines.push({
            group: 'personal',
            kind: row.kind,
            label: row.label,
            categoryKey: row.categoryKey,
            ownerMembershipId: membershipId,
            amount: { entry: 'total', totalMinor: amount.toString() },
          });
      continue;
    }
    if (amounts.length === 0) continue;
    lines.push({
      group: row.group,
      kind: row.kind,
      label: row.label,
      categoryKey: row.categoryKey,
      split: { mode: 'custom' },
      amount: {
        entry: 'shares',
        shares: Object.keys(sheet.memberColumns).map((membershipId) => ({
          membershipId,
          amountMinor: (row.amounts[membershipId] ?? 0n).toString(),
        })),
      },
    });
  }
  return {
    periodStart,
    incomes: sheet.incomes.map((i) => ({
      membershipId: i.membershipId,
      label: i.label,
      amountMinor: i.amount.toString(),
      countsTowardHousehold: i.counts,
    })),
    lines,
  };
}
