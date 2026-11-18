import { dueOccurrences, occurrenceDate } from '../../src/domain/tracking/recurring';

describe('occurrenceDate', () => {
  it('uses the day in a calendar month, clamped to its last day', () => {
    expect(occurrenceDate(5, { start: '2026-11-01', end: '2026-11-30' })).toBe('2026-11-05');
    expect(occurrenceDate(31, { start: '2026-11-01', end: '2026-11-30' })).toBe('2026-11-30');
    expect(occurrenceDate(31, { start: '2027-02-01', end: '2027-02-28' })).toBe('2027-02-28');
    expect(occurrenceDate(30, { start: '2028-02-01', end: '2028-02-29' })).toBe('2028-02-29');
  });

  it('picks the date inside a period that spans two calendar months', () => {
    const period = { start: '2026-10-28', end: '2026-11-27' };
    expect(occurrenceDate(5, period)).toBe('2026-11-05');
    expect(occurrenceDate(30, period)).toBe('2026-10-30');
    expect(occurrenceDate(28, period)).toBe('2026-10-28');
    expect(occurrenceDate(27, period)).toBe('2026-11-27');
  });

  it('handles a short transition period with no matching day', () => {
    expect(occurrenceDate(5, { start: '2026-11-10', end: '2026-11-27' })).toBeNull();
  });
});

describe('dueOccurrences', () => {
  const period = { start: '2026-11-01', end: '2026-11-30' };
  const rule = { dayOfMonth: 5, startsOn: '2026-01-01', active: true };

  it('is due once the date has arrived', () => {
    expect(dueOccurrences(rule, period, '2026-11-04')).toEqual([]);
    expect(dueOccurrences(rule, period, '2026-11-05')).toEqual(['2026-11-05']);
    expect(dueOccurrences(rule, period, '2026-12-20')).toEqual(['2026-11-05']);
  });

  it('is never due when paused or before startsOn', () => {
    expect(dueOccurrences({ ...rule, active: false }, period, '2026-11-20')).toEqual([]);
    expect(dueOccurrences({ ...rule, startsOn: '2026-11-06' }, period, '2026-11-20')).toEqual([]);
  });
});
