import { computeMonthSummary, savingsRatePermille } from '../../src/domain/planning/summary';
import { expected, FABIEN, incomes, lines, MAELLE, members } from '../fixtures/novembre-2026';

describe('computeMonthSummary — Novembre 2026 (SC-003)', () => {
  const summary = computeMonthSummary({ members, incomes, lines, privateAggregates: [] });
  const byId = (id: string) => summary.members.find((m) => m.membershipId === id)!;

  it.each([MAELLE, FABIEN])('figures for %s', (id) => {
    const { membershipId, ...rest } = byId(id);
    expect(membershipId).toBe(id);
    expect(rest).toEqual(expected[id as typeof MAELLE]);
  });

  it('household totals', () => {
    expect(summary.household).toEqual(expected.household);
  });

  it('keeps member order', () => {
    expect(summary.members.map((m) => m.membershipId)).toEqual([MAELLE, FABIEN]);
  });

  it('is independent of line order', () => {
    const shuffled = [...lines].reverse();
    expect(computeMonthSummary({ members, incomes, lines: shuffled, privateAggregates: [] })).toEqual(summary);
  });

  it('counts private aggregates in DI and savings', () => {
    const withPrivate = computeMonthSummary({
      members,
      incomes,
      lines,
      privateAggregates: [{ membershipId: MAELLE, total: 10000n, savings: 2000n }],
    });
    const m = withPrivate.members.find((x) => x.membershipId === MAELLE)!;
    expect(m.di).toBe(expected[MAELLE].di + 10000n);
    expect(m.savings).toBe(expected[MAELLE].savings + 2000n);
    expect(m.whatsLeft).toBe(expected[MAELLE].whatsLeft - 10000n);
    expect(withPrivate.household.planned).toBe(expected.household.planned + 10000n);
  });

  it('a month with no lines and no income', () => {
    const empty = computeMonthSummary({ members, incomes: [], lines: [], privateAggregates: [] });
    expect(empty.members[0]).toMatchObject({ whatsLeft: 0n, savingsRatePermille: null, overrun: false });
  });
});

describe('savingsRatePermille', () => {
  it('is null without income', () => {
    expect(savingsRatePermille(100n, 0n)).toBeNull();
  });
  it('rounds half up to a tenth of a percent', () => {
    expect(savingsRatePermille(28192n, 200000n)).toBe(141);
    expect(savingsRatePermille(75500n, 299000n)).toBe(253);
    expect(savingsRatePermille(1n, 2000n)).toBe(1); // 0.5 ‰ → 1
    expect(savingsRatePermille(1n, 2001n)).toBe(0);
  });
});
