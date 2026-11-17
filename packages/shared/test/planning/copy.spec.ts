import { adaptAmounts, copyLinesForNewMonth, type CopySource } from '../../src/domain/planning/copy';
import type { PlanIncome, PlanMember } from '../../src/domain/planning/types';

const A = 'a';
const B = 'b';
const C = 'c';
const members = (...ids: string[]): PlanMember[] => ids.map((membershipId, order) => ({ membershipId, order }));
const incomes: PlanIncome[] = [
  { membershipId: A, amount: 200000n, counts: true },
  { membershipId: B, amount: 300000n, counts: true },
];

const line = (over: Partial<CopySource> = {}): CopySource => ({
  group: 'recurring_shared',
  ownerMembershipId: null,
  splitMode: 'custom',
  payerMembershipId: null,
  totalMinor: 40000n,
  shares: { [A]: 10000n, [B]: 30000n },
  formula: null,
  usual: null,
  ...over,
});

describe('copyLinesForNewMonth (US2, research R14)', () => {
  it('copies recurring groups only, unless one-off lines are asked for', () => {
    const src = [
      line({ group: 'personal', ownerMembershipId: A, splitMode: null, totalMinor: 1500n, shares: { [A]: 1500n } }),
      line(),
      line({ group: 'one_off_shared' }),
    ];
    expect(copyLinesForNewMonth(src, members(A, B), incomes, { includeOneOff: false }).map((c) => c.source.group)).toEqual([
      'personal',
      'recurring_shared',
    ]);
    expect(copyLinesForNewMonth(src, members(A, B), incomes, { includeOneOff: true })).toHaveLength(3);
  });

  it('uses the usual values of a "this month only" exception (FR-024)', () => {
    const exception = line({
      totalMinor: 60000n,
      shares: { [A]: 20000n, [B]: 40000n },
      usual: { totalMinor: 40000n, splitMode: 'custom', payerMembershipId: null, shares: { [A]: 10000n, [B]: 30000n }, formula: null },
    });
    const [copy] = copyLinesForNewMonth([exception], members(A, B), incomes, { includeOneOff: false });
    expect(copy.amounts.totalMinor).toBe(40000n);
    expect(copy.amounts.shares).toEqual({ [A]: 10000n, [B]: 30000n });
  });

  it('drops personal lines of members no longer contributing', () => {
    const src = [line({ group: 'personal', ownerMembershipId: C, splitMode: null, totalMinor: 100n, shares: { [C]: 100n } })];
    expect(copyLinesForNewMonth(src, members(A, B), incomes, { includeOneOff: false })).toEqual([]);
  });
});

describe('adaptAmounts (research R8)', () => {
  it('drops a departed member share from a custom line and flags it for review', () => {
    const r = adaptAmounts(line({ shares: { [A]: 10000n, [B]: 20000n, [C]: 10000n } }), members(A, B), incomes);
    expect(r.amounts.shares).toEqual({ [A]: 10000n, [B]: 20000n });
    expect(r.amounts.totalMinor).toBe(30000n);
    expect(r.needsReview).toBe(true);
  });

  it('does not flag a departed member whose share was 0', () => {
    const r = adaptAmounts(line({ shares: { [A]: 10000n, [B]: 30000n, [C]: 0n } }), members(A, B), incomes);
    expect(r.needsReview).toBe(false);
  });

  it('adds a 0 share for a new member on a custom line', () => {
    const r = adaptAmounts(line(), members(A, B, C), incomes);
    expect(r.amounts.shares).toEqual({ [A]: 10000n, [B]: 30000n, [C]: 0n });
    expect(r.needsReview).toBe(false);
  });

  it('recomputes equal and proportional lines over the target members', () => {
    expect(adaptAmounts(line({ splitMode: 'equal', shares: { [A]: 20000n, [B]: 20000n } }), members(A, B, C), incomes).amounts.shares).toEqual({
      [A]: 13334n,
      [B]: 13333n,
      [C]: 13333n,
    });
    const p = adaptAmounts(line({ splitMode: 'proportional', totalMinor: 50000n, shares: { [A]: 25000n, [B]: 25000n } }), members(A, B), incomes);
    expect(p.amounts.shares).toEqual({ [A]: 20000n, [B]: 30000n });
  });

  it('keeps proportional shares and flags needsIncome when there is no counted income', () => {
    const p = adaptAmounts(line({ splitMode: 'proportional', totalMinor: 50000n, shares: { [A]: 25000n, [B]: 25000n } }), members(A, B), []);
    expect(p.amounts.shares).toEqual({ [A]: 25000n, [B]: 25000n });
    expect(p.needsIncome).toBe(true);
  });

  it('flags a one-payer line whose payer left and gives the total to nobody new', () => {
    const r = adaptAmounts(line({ splitMode: 'one_payer', payerMembershipId: C, totalMinor: 6000n, shares: { [A]: 0n, [B]: 0n, [C]: 6000n } }), members(A, B), incomes);
    expect(r.needsReview).toBe(true);
    expect(r.amounts.splitMode).toBe('custom');
    expect(r.amounts.totalMinor).toBe(0n);
  });
});
