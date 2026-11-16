import {
  addDays,
  budgetMonthFor,
  daysBetween,
  localDateIn,
  planStartDayChange,
  type MonthStartRule,
} from '../src/domain/budget-month';

const rule = (effectiveFrom: string, startDay: number): MonthStartRule => ({ effectiveFrom, startDay });

describe('budgetMonthFor (FR-004)', () => {
  it('start day 1: the calendar month', () => {
    expect(budgetMonthFor('2026-11-16', [rule('2026-11-01', 1)])).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    });
  });

  it('start day 28 on 16 November: 28 Oct – 27 Nov (US1 scenario 2)', () => {
    expect(budgetMonthFor('2026-11-16', [rule('2026-10-28', 28)])).toEqual({
      start: '2026-10-28',
      end: '2026-11-27',
    });
  });

  it('start day 28 on the start day itself', () => {
    expect(budgetMonthFor('2026-11-28', [rule('2026-10-28', 28)])).toEqual({
      start: '2026-11-28',
      end: '2026-12-27',
    });
  });

  it('rolls over the year', () => {
    expect(budgetMonthFor('2027-01-05', [rule('2026-10-28', 28)])).toEqual({
      start: '2026-12-28',
      end: '2027-01-27',
    });
  });

  it('handles February with start day 28', () => {
    expect(budgetMonthFor('2027-02-28', [rule('2026-10-28', 28)])).toEqual({
      start: '2027-02-28',
      end: '2027-03-27',
    });
    expect(budgetMonthFor('2027-02-27', [rule('2026-10-28', 28)])).toEqual({
      start: '2027-01-28',
      end: '2027-02-27',
    });
  });

  it('uses the first rule for dates before it', () => {
    expect(budgetMonthFor('2026-09-10', [rule('2026-11-01', 1)])).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
  });

  it('refuses an empty rule list', () => {
    expect(() => budgetMonthFor('2026-11-16', [])).toThrow();
  });
});

describe('start-day changes (FR-005, research R5)', () => {
  it('1 → 28 changed on 16 Nov: current 1–30 Nov, transition 1–27 Dec, then 28 Dec – 27 Jan', () => {
    const initial = [rule('2026-01-01', 1)];
    const change = planStartDayChange(initial, '2026-11-16', 28);
    expect(change).toEqual(rule('2026-12-01', 28));
    const rules = [...initial, change!];
    expect(budgetMonthFor('2026-11-16', rules)).toEqual({ start: '2026-11-01', end: '2026-11-30' });
    expect(budgetMonthFor('2026-12-10', rules)).toEqual({ start: '2026-12-01', end: '2026-12-27' });
    expect(budgetMonthFor('2027-01-10', rules)).toEqual({ start: '2026-12-28', end: '2027-01-27' });
  });

  it('28 → 1 changed on 16 Nov: current 28 Oct – 27 Nov, transition 28 Nov – 31 Dec, then January', () => {
    const initial = [rule('2026-01-28', 28)];
    const change = planStartDayChange(initial, '2026-11-16', 1);
    expect(change).toEqual(rule('2026-11-28', 1));
    const rules = [...initial, change!];
    expect(budgetMonthFor('2026-11-16', rules)).toEqual({ start: '2026-10-28', end: '2026-11-27' });
    expect(budgetMonthFor('2026-12-31', rules)).toEqual({ start: '2026-11-28', end: '2026-12-31' });
    expect(budgetMonthFor('2027-01-01', rules)).toEqual({ start: '2027-01-01', end: '2027-01-31' });
  });

  it('returns null when the start day does not change', () => {
    expect(planStartDayChange([rule('2026-01-01', 1)], '2026-11-16', 1)).toBeNull();
  });

  it('a pending change can be replaced: it starts on the same day', () => {
    const rules = [rule('2026-01-01', 1), rule('2026-12-01', 28)];
    expect(planStartDayChange(rules, '2026-11-20', 15)).toEqual(rule('2026-12-01', 15));
  });

  it('every transition month lasts 15 to 45 days and months chain without gaps', () => {
    for (let from = 1; from <= 28; from++) {
      for (let to = 1; to <= 28; to++) {
        if (from === to) continue;
        for (let month = 1; month <= 12; month++) {
          const today = `2026-${String(month).padStart(2, '0')}-16`;
          const initial = [rule('2025-01-' + String(from).padStart(2, '0'), from)];
          const change = planStartDayChange(initial, today, to)!;
          const rules = [...initial, change];
          const transition = budgetMonthFor(change.effectiveFrom, rules);
          expect(transition.start).toBe(change.effectiveFrom);
          const length = daysBetween(transition.start, transition.end) + 1;
          expect(length).toBeGreaterThanOrEqual(15);
          expect(length).toBeLessThanOrEqual(45);
          const previous = budgetMonthFor(addDays(transition.start, -1), rules);
          expect(addDays(previous.end, 1)).toBe(transition.start);
          const next = budgetMonthFor(addDays(transition.end, 1), rules);
          expect(next.start).toBe(addDays(transition.end, 1));
          expect(Number(next.start.slice(8))).toBe(to);
        }
      }
    }
  });
});

describe('localDateIn (research R5)', () => {
  it('returns the Paris calendar date late in the UTC evening', () => {
    expect(localDateIn(new Date('2026-11-16T23:30:00Z'), 'Europe/Paris')).toBe('2026-11-17');
    expect(localDateIn(new Date('2026-11-16T22:30:00Z'), 'Europe/Paris')).toBe('2026-11-16');
  });

  it('is correct across both DST switches', () => {
    // Summer time (UTC+2) ends on 25 Oct 2026 at 01:00 UTC.
    expect(localDateIn(new Date('2026-10-24T22:30:00Z'), 'Europe/Paris')).toBe('2026-10-25');
    expect(localDateIn(new Date('2026-10-25T22:30:00Z'), 'Europe/Paris')).toBe('2026-10-25');
    // Summer time starts on 29 Mar 2026 at 01:00 UTC.
    expect(localDateIn(new Date('2026-03-28T23:30:00Z'), 'Europe/Paris')).toBe('2026-03-29');
    expect(localDateIn(new Date('2026-03-29T22:30:00Z'), 'Europe/Paris')).toBe('2026-03-30');
  });
});
