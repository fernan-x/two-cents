import type { Group, Kind } from '../planning/types';

/** One spreadsheet cell as SheetJS gives it (`raw: true`). */
export type Cell = string | number | boolean | null;
export type Grid = Cell[][];

export interface ImportMember {
  membershipId: string;
  firstName: string;
}

export type RowIssue = 'unreadable_amount' | 'unknown_group';

export type CategoryKey =
  | 'housing'
  | 'food'
  | 'transport'
  | 'pets'
  | 'leisure'
  | 'health'
  | 'subscriptions'
  | 'savings'
  | 'gifts'
  | 'other';

export interface ProposedRow {
  rowIndex: number;
  label: string;
  /** Null when no section header was seen: the person must choose (issue `unknown_group`). */
  group: Group | null;
  kind: Kind;
  categoryKey: CategoryKey | null;
  /** membershipId → amount in minor units, null when the cell is empty or unreadable. */
  amounts: Record<string, bigint | null>;
  issues: RowIssue[];
}

export interface ProposedIncome {
  membershipId: string;
  label: string;
  amount: bigint;
  counts: boolean;
  rowIndex: number;
}

export interface ProposedSheet {
  sheetName: string;
  period: { year: number; month: number } | null;
  /** membershipId → column index. */
  memberColumns: Record<string, number>;
  incomes: ProposedIncome[];
  rows: ProposedRow[];
  /** Totals the spreadsheet computed itself, shown next to the app's (FR-042). */
  sheetTotals: { whatsLeft: Record<string, bigint | null> };
}
