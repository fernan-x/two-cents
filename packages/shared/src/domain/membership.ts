import type { BudgetMonth, LocalDate } from './budget-month';
import type { Role } from './permissions';

/** Members plus pending invitations never exceed this (FR-023). */
export const MAX_PEOPLE = 6;

export interface MonthMembership {
  role: Role;
  /** Local date (budget time zone) the person joined. */
  joinedOn: LocalDate;
  /** Local date they left, or null while current. */
  leftOn: LocalDate | null;
}

/**
 * Whether a person counts in a budget month (FR-033, clarification Q3): viewers never do; someone
 * who leaves stays in the month they left and is out of every month that starts later.
 */
export function isIncludedInMonth(m: MonthMembership, month: BudgetMonth): boolean {
  if (m.role === 'viewer') return false;
  if (m.joinedOn > month.end) return false;
  return m.leftOn === null || m.leftOn >= month.start;
}

/** Whether one more invitation fits (FR-023). */
export function canInvite(counts: { currentMembers: number; pendingInvitations: number }): boolean {
  return counts.currentMembers + counts.pendingInvitations < MAX_PEOPLE;
}
