import type { BudgetDetail } from '@two-cents/shared/contracts';
import { budgetMonthFor } from '@two-cents/shared/domain';

/**
 * The budget month holding a date, as the app can tell (FR-002). The server decides from the date
 * itself, so a different answer (older start days) only moves the row once it syncs.
 */
export function monthStartOf(budget: Pick<BudgetDetail, 'monthStartDay' | 'currentMonth' | 'pendingMonthStartDay'>, date: string): string {
  const rules = [{ effectiveFrom: '1900-01-01', startDay: budget.monthStartDay }];
  if (budget.pendingMonthStartDay) rules.push(budget.pendingMonthStartDay);
  if (date >= budget.currentMonth.start && date <= budget.currentMonth.end) return budget.currentMonth.start;
  return budgetMonthFor(date, rules).start;
}

/** Today in the budget's time zone. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
