import type { MonthStatus } from './month-status';
import type { Group } from './types';

/** Fields whose change on a recurring line needs "from this month on" or "this month only" (FR-024). */
export const AMOUNT_FIELDS = ['totalMinor', 'shares', 'splitMode', 'payerMembershipId', 'formula'] as const;

export function needsScope(group: Group, changedFields: readonly string[]): boolean {
  if (group === 'one_off_shared') return false;
  return changedFields.some((f) => (AMOUNT_FIELDS as readonly string[]).includes(f));
}

/** A "from this month on" change reaches a later month only if it is Draft and not edited by hand (FR-025). */
export function shouldPropagate(input: { laterMonthStatus: MonthStatus; handEdited: boolean }): boolean {
  return input.laterMonthStatus === 'draft' && !input.handEdited;
}
