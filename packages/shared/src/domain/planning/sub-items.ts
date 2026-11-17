import { PlanningError } from './errors';

/** Envelope sub-items (FR-015): optional amounts whose sum may not exceed the line total. */
export function validateSubItems(total: bigint, subItems: ReadonlyArray<{ amountMinor: bigint | null }>): void {
  let sum = 0n;
  for (const item of subItems) {
    if (item.amountMinor === null) continue;
    if (item.amountMinor < 0n) throw new PlanningError('INVALID_AMOUNT');
    sum += item.amountMinor;
  }
  if (sum > total) throw new PlanningError('SUB_ITEMS_EXCEED_TOTAL');
}
