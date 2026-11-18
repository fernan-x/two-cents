import { computeTracking } from '../../src/domain/tracking/actuals';
import { computeBalances } from '../../src/domain/tracking/balances';
import { computeVouchers } from '../../src/domain/tracking/vouchers';
import {
  FABIEN,
  MAELLE,
  balanceLines,
  fabienPaysCourses,
  maelleVouchers,
  members,
  trackLines,
  txnsOver,
  txnsUpTo82,
  voucherIncomes,
} from '../fixtures/novembre-2026-actuals';

/** Quickstart figures (spec 004 US2, US6, US7) as regressions. */
describe('Novembre 2026 actuals', () => {
  const courses = (txns: typeof txnsOver) => computeTracking({ lines: trackLines, txns }).lines.find((l) => l.lineId === 'Courses')!;

  it('warns at 82,5 % of the Courses envelope', () => {
    expect(courses(txnsUpTo82).envelope).toMatchObject({ spent: 33000n, remaining: 7000n, progressPermille: 825, level: 'warning' });
  });

  it('shows over budget by 20,00 €', () => {
    expect(courses(txnsOver).envelope).toMatchObject({ spent: 42000n, remaining: 0n, over: 2000n, level: 'over' });
  });

  it('Maëlle owes Fabien 26,12 €', () => {
    expect(computeBalances({ members, txns: [fabienPaysCourses], lines: balanceLines, settlements: [] })).toEqual([
      { from: MAELLE, to: FABIEN, amount: 2612n },
    ]);
  });

  it('leaves Maëlle 102,50 € of meal vouchers', () => {
    expect(computeVouchers({ members, incomes: voucherIncomes, txns: maelleVouchers })[0]).toEqual({
      membershipId: MAELLE,
      income: 16000n,
      spent: 5750n,
      remaining: 10250n,
    });
  });

  it('counts every other line as not tracked', () => {
    const t = computeTracking({ lines: trackLines, txns: txnsOver });
    expect(t.month.notTrackedCount).toBe(trackLines.length - 1);
    expect(t.month.actual).toBe(42000n);
  });
});
