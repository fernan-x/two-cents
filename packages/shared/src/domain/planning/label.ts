import { addDays, type BudgetMonth } from '../budget-month';

/**
 * The calendar month a budget month is named after (research R1): the one holding most of its
 * days, ties going to the later month. 28 Oct – 27 Nov → November.
 */
export function monthLabelFor(period: BudgetMonth): { year: number; month: number } {
  const counts = new Map<string, number>();
  for (let d = period.start; d <= period.end; d = addDays(d, 1)) {
    const key = d.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = '';
  let bestCount = -1;
  for (const [key, count] of counts) {
    // Keys arrive in date order, so >= lets a later month win a tie.
    if (count >= bestCount) {
      best = key;
      bestCount = count;
    }
  }
  return { year: Number(best.slice(0, 4)), month: Number(best.slice(5, 7)) };
}
