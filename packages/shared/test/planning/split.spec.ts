import { PlanningError } from '../../src/domain/planning/errors';
import { computeShares, splitByWeights } from '../../src/domain/planning/split';
import type { PlanIncome, PlanMember } from '../../src/domain/planning/types';

const A = 'a';
const B = 'b';
const C = 'c';
const two: PlanMember[] = [
  { membershipId: A, order: 0 },
  { membershipId: B, order: 1 },
];

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof PlanningError ? e.code : 'not a PlanningError';
  }
  return undefined;
}

describe('splitByWeights (largest remainder, FR-021)', () => {
  it('gives the odd cent to the first member on a tie', () => {
    expect(splitByWeights(1001n, [1n, 1n])).toEqual([501n, 500n]);
    expect(splitByWeights(1000n, [1n, 1n, 1n])).toEqual([334n, 333n, 333n]);
  });

  it('gives remainder cents to the largest fractional parts first', () => {
    // 100 split 1:2 → 33.33 / 66.66 → the second has the larger fraction
    expect(splitByWeights(100n, [1n, 2n])).toEqual([33n, 67n]);
  });

  it('splits proportionally to incomes', () => {
    expect(splitByWeights(50000n, [200000n, 300000n])).toEqual([20000n, 30000n]);
  });

  it('accepts a zero weight', () => {
    expect(splitByWeights(1000n, [0n, 1n])).toEqual([0n, 1000n]);
  });

  it('refuses all-zero weights', () => {
    expect(codeOf(() => splitByWeights(1000n, [0n, 0n]))).toBe('NO_INCOME_FOR_PROPORTIONAL');
  });

  it('always adds up to the total', () => {
    for (const total of [0n, 1n, 7n, 999n, 123457n]) {
      for (const weights of [[1n], [1n, 1n], [3n, 5n, 7n], [1n, 1n, 1n, 1n, 1n, 1n]]) {
        const parts = splitByWeights(total, weights);
        expect(parts.reduce((s, p) => s + p, 0n)).toBe(total);
      }
    }
  });
});

describe('computeShares (FR-017, FR-020, FR-022)', () => {
  const incomes: PlanIncome[] = [
    { membershipId: A, amount: 200000n, counts: true },
    { membershipId: B, amount: 300000n, counts: true },
    { membershipId: B, amount: 99999n, counts: false },
  ];

  it('equal', () => {
    expect(computeShares({ mode: 'equal', total: 50000n, members: two, incomes })).toEqual({
      total: 50000n,
      shares: { [A]: 25000n, [B]: 25000n },
    });
  });

  it('proportional to counted income only', () => {
    expect(computeShares({ mode: 'proportional', total: 50000n, members: two, incomes }).shares).toEqual({
      [A]: 20000n,
      [B]: 30000n,
    });
  });

  it('proportional with no counted income is refused', () => {
    expect(
      codeOf(() =>
        computeShares({ mode: 'proportional', total: 100n, members: two, incomes: [{ membershipId: A, amount: 5n, counts: false }] }),
      ),
    ).toBe('NO_INCOME_FOR_PROPORTIONAL');
  });

  it('one payer', () => {
    expect(computeShares({ mode: 'one_payer', total: 6000n, payerMembershipId: B, members: two, incomes }).shares).toEqual({
      [A]: 0n,
      [B]: 6000n,
    });
  });

  it('one payer must be a contributing member', () => {
    expect(codeOf(() => computeShares({ mode: 'one_payer', total: 1n, payerMembershipId: C, members: two, incomes }))).toBe(
      'UNKNOWN_MEMBER',
    );
  });

  it('custom computes the total from entered shares, missing members count as 0', () => {
    expect(computeShares({ mode: 'custom', enteredShares: { [A]: 10000n }, members: two, incomes })).toEqual({
      total: 10000n,
      shares: { [A]: 10000n, [B]: 0n },
    });
  });

  it('custom with a total that does not match is refused with the difference', () => {
    try {
      computeShares({ mode: 'custom', total: 40000n, enteredShares: { [A]: 10000n, [B]: 25000n }, members: two, incomes });
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(PlanningError);
      expect((e as PlanningError).code).toBe('SPLIT_MISMATCH');
      expect((e as PlanningError).details).toEqual({ differenceMinor: 5000n });
    }
  });

  it('custom refuses shares of non-members', () => {
    expect(codeOf(() => computeShares({ mode: 'custom', enteredShares: { [C]: 1n }, members: two, incomes }))).toBe(
      'UNKNOWN_MEMBER',
    );
  });

  it('modes other than custom need a total', () => {
    expect(codeOf(() => computeShares({ mode: 'equal', members: two, incomes }))).toBe('TOTAL_REQUIRED');
  });

  it('refuses negative amounts and amounts above the limit', () => {
    expect(codeOf(() => computeShares({ mode: 'equal', total: -1n, members: two, incomes }))).toBe('INVALID_AMOUNT');
    expect(codeOf(() => computeShares({ mode: 'equal', total: 100_000_001n, members: two, incomes }))).toBe(
      'AMOUNT_TOO_LARGE',
    );
  });

  it('uses member order for ties, whatever the array order', () => {
    const reversed = [two[1], two[0]];
    expect(computeShares({ mode: 'equal', total: 1001n, members: reversed, incomes }).shares).toEqual({
      [A]: 501n,
      [B]: 500n,
    });
  });
});
