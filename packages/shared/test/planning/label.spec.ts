import { monthLabelFor } from '../../src/domain/planning/label';

describe('monthLabelFor (research R1)', () => {
  it.each([
    ['2026-11-01', '2026-11-30', 2026, 11],
    ['2026-10-28', '2026-11-27', 2026, 11],
    ['2026-11-02', '2026-12-01', 2026, 11],
    ['2026-10-15', '2026-11-14', 2026, 10],
    ['2026-12-28', '2027-01-27', 2027, 1],
    ['2026-02-01', '2026-02-28', 2026, 2],
  ])('%s..%s → %i/%i', (start, end, year, month) => {
    expect(monthLabelFor({ start, end })).toEqual({ year, month });
  });

  it('a long transition month spanning three calendar months picks the fullest one', () => {
    // 20 Oct – 3 Dec: Oct 12 days, Nov 30 days, Dec 3 days
    expect(monthLabelFor({ start: '2026-10-20', end: '2026-12-03' })).toEqual({ year: 2026, month: 11 });
  });

  it('ties go to the later month', () => {
    // 16 Nov – 15 Dec: 15 days in each → December
    expect(monthLabelFor({ start: '2026-11-16', end: '2026-12-15' })).toEqual({ year: 2026, month: 12 });
  });
});
