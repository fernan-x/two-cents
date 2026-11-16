/** A calendar date, `YYYY-MM-DD`, with no time or zone. */
export type LocalDate = string;

export interface BudgetMonth {
  start: LocalDate;
  end: LocalDate;
}

/** One entry of the start-day history (data-model `budget_month_start_rule`). */
export interface MonthStartRule {
  /** First day of the first month this rule governs (for a change: the transition month start). */
  effectiveFrom: LocalDate;
  /** 1–28. */
  startDay: number;
}

export const MIN_START_DAY = 1;
export const MAX_START_DAY = 28;
/** A transition month is at least this long (research R5). */
export const MIN_TRANSITION_DAYS = 15;

const DAY_MS = 86_400_000;

function toUtc(date: LocalDate): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

/** `day` of the month `monthOffset` months after the month of `date`. `day` must be 1–28. */
function dayOfMonth(date: LocalDate, monthOffset: number, day: number): LocalDate {
  const [y, m] = date.split('-').map(Number);
  return fromUtc(Date.UTC(y, m - 1 + monthOffset, day));
}

/** The regular month (start day `startDay`) that contains `date`. */
function regularMonth(date: LocalDate, startDay: number): BudgetMonth {
  const day = Number(date.slice(8, 10));
  const start = day >= startDay ? dayOfMonth(date, 0, startDay) : dayOfMonth(date, -1, startDay);
  return { start, end: addDays(dayOfMonth(start, 1, startDay), -1) };
}

/** First date on or after `from` whose day of month is `day`. */
function nextOccurrence(from: LocalDate, day: number): LocalDate {
  const sameMonth = dayOfMonth(from, 0, day);
  return sameMonth >= from ? sameMonth : dayOfMonth(from, 1, day);
}

function sortedRules(rules: readonly MonthStartRule[]): MonthStartRule[] {
  if (rules.length === 0) throw new Error('A budget needs at least one month start rule');
  return [...rules].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
}

/**
 * The budget month containing `date` (FR-004), honouring start-day changes (FR-005, research R5).
 * The first rule governs every date before it with regular months. A later rule starts with a
 * transition month: from its `effectiveFrom` to the day before the first occurrence of its start
 * day that is at least 15 days later, so a transition lasts 15–45 days.
 */
export function budgetMonthFor(date: LocalDate, rules: readonly MonthStartRule[]): BudgetMonth {
  const sorted = sortedRules(rules);
  let index = 0;
  for (let i = 0; i < sorted.length; i++) if (sorted[i].effectiveFrom <= date) index = i;
  const rule = sorted[index];
  const next = sorted[index + 1];

  let month: BudgetMonth;
  if (index === 0) {
    month = regularMonth(date, rule.startDay);
  } else {
    const transitionEnd = addDays(
      nextOccurrence(addDays(rule.effectiveFrom, MIN_TRANSITION_DAYS), rule.startDay),
      -1,
    );
    month =
      date <= transitionEnd
        ? { start: rule.effectiveFrom, end: transitionEnd }
        : regularMonth(date, rule.startDay);
  }
  // A later rule cuts the month short (only possible with hand-made rules; changes always start a new month).
  if (next && month.end >= next.effectiveFrom) month = { ...month, end: addDays(next.effectiveFrom, -1) };
  return month;
}

/**
 * The rule a start-day change adds when made on `today` (FR-005): it takes effect the day after the
 * current month ends, so the current month keeps its dates. A pending change (a rule that starts
 * after today) is ignored and should be replaced by the result. Returns `null` when the start day
 * governing the current month is already `newStartDay`.
 */
export function planStartDayChange(
  rules: readonly MonthStartRule[],
  today: LocalDate,
  newStartDay: number,
): MonthStartRule | null {
  const inForce = sortedRules(rules).filter((r, i) => i === 0 || r.effectiveFrom <= today);
  const current = budgetMonthFor(today, inForce);
  if (inForce[inForce.length - 1].startDay === newStartDay) return null;
  return { effectiveFrom: addDays(current.end, 1), startDay: newStartDay };
}

/** The calendar date of `instant` in `timeZone` (IANA), the only zone-aware step (research R5). */
export function localDateIn(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}
