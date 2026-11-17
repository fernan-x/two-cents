/** Planning types (data-model.md "Shared domain types"). Money is always bigint minor units. */

export const GROUPS = ['personal', 'recurring_shared', 'one_off_shared'] as const;
export type Group = (typeof GROUPS)[number];

export const KINDS = ['expense', 'savings'] as const;
export type Kind = (typeof KINDS)[number];

export const SPLIT_MODES = ['custom', 'equal', 'proportional', 'one_payer'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

/** A member contributing to a month. `order` (join date, then id) breaks rounding ties. */
export interface PlanMember {
  membershipId: string;
  order: number;
}

export interface PlanIncome {
  membershipId: string;
  amount: bigint;
  /** "Counts toward the household budget" (FR-009). */
  counts: boolean;
}

export interface PlanLine {
  group: Group;
  kind: Kind;
  total: bigint;
  /** membershipId → amount. A missing member counts as 0. */
  shares: Readonly<Record<string, bigint>>;
}

/** The private personal lines of one member, seen by others only as a sum (FR-019, R10). */
export interface PrivateAggregate {
  membershipId: string;
  total: bigint;
  savings: bigint;
}

/** Sorted by `order`, without mutating the input. */
export function byOrder(members: readonly PlanMember[]): PlanMember[] {
  return [...members].sort((a, b) => a.order - b.order);
}
