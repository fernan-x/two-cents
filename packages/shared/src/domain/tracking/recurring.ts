import type { BudgetMonth, LocalDate } from '../budget-month';

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/**
 * The date of a "day N of the month" rule inside a budget period (R9): day N of a calendar month
 * the period touches, clamped to that month's last day, that falls inside the period. Null when
 * none does (a short transition period).
 */
export function occurrenceDate(dayOfMonth: number, period: BudgetMonth): LocalDate | null {
  const [sy, sm] = period.start.split('-').map(Number);
  const [ey, em] = period.end.split('-').map(Number);
  let y = sy;
  let m = sm;
  for (;;) {
    const date = `${y}-${pad(m)}-${pad(Math.min(dayOfMonth, lastDay(y, m)))}`;
    if (date >= period.start && date <= period.end) return date;
    if (y === ey && m === em) return null;
    m += 1;
    if (m === 13) {
      m = 1;
      y += 1;
    }
  }
}

export interface RecurringRuleShape {
  dayOfMonth: number;
  startsOn: LocalDate;
  active: boolean;
}

/** Occurrences of a rule in a period that are due by `today` (0 or 1 date). */
export function dueOccurrences(rule: RecurringRuleShape, period: BudgetMonth, today: LocalDate): LocalDate[] {
  if (!rule.active) return [];
  const date = occurrenceDate(rule.dayOfMonth, period);
  return date && date <= today && date >= rule.startsOn ? [date] : [];
}
