import { PlanningError } from '@two-cents/shared/domain';
import { IncomeLine } from '../../domain/entities/income-line';
import type { MonthContext } from '../services/month-writer';
import { resolveAmounts } from './lines';

const A = 'aaaaaaaa-0000-7000-8000-000000000001';
const B = 'bbbbbbbb-0000-7000-8000-000000000002';
const now = new Date('2026-11-16T10:00:00Z');

const income = (membershipId: string, amount: bigint, counts = true) =>
  IncomeLine.create({
    id: `${membershipId}-i`,
    monthId: 'm',
    membershipId,
    label: null,
    amountMinor: amount,
    currency: 'EUR',
    countsTowardHousehold: counts,
    toConfirm: false,
    isPrimary: true,
    position: 0,
    version: 1,
    createdAt: now,
    createdBy: membershipId,
    updatedAt: now,
    updatedBy: membershipId,
  });

const ctx = (incomes: IncomeLine[] = []) =>
  ({
    planMembers: [
      { membershipId: A, order: 0 },
      { membershipId: B, order: 1 },
    ],
    incomes,
  }) as unknown as MonthContext;

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as PlanningError | { code: string }).code;
  }
  return undefined;
};

describe('resolveAmounts (US1/US3: FR-017, FR-020, FR-023)', () => {
  it('a personal line holds only its owner share', () => {
    expect(
      resolveAmounts(ctx(), 'personal', A, null, {
        entry: 'total',
        totalMinor: '1500',
      }),
    ).toEqual({
      totalMinor: 1500n,
      splitMode: null,
      payerMembershipId: null,
      shares: { [A]: 1500n },
      formula: null,
    });
  });

  it('a personal line can be a periodic formula', () => {
    const r = resolveAmounts(ctx(), 'personal', A, null, {
      entry: 'total',
      formula: { kind: 'per_year', baseMinor: '8000', factor: 1 },
    });
    expect(r.totalMinor).toBe(667n);
    expect(r.formula).toEqual({
      kind: 'per_year',
      baseMinor: 8000n,
      factor: 1,
    });
  });

  it('a custom split computes the total from the shares', () => {
    const r = resolveAmounts(
      ctx(),
      'recurring_shared',
      null,
      { mode: 'custom' },
      {
        entry: 'shares',
        shares: [
          { membershipId: A, amountMinor: '10000' },
          { membershipId: B, amountMinor: '30000' },
        ],
      },
    );
    expect(r.totalMinor).toBe(40000n);
    expect(r.shares).toEqual({ [A]: 10000n, [B]: 30000n });
  });

  it('refuses a custom split whose shares miss the entered total', () => {
    expect(
      codeOf(() =>
        resolveAmounts(
          ctx(),
          'recurring_shared',
          null,
          { mode: 'custom' },
          {
            entry: 'shares',
            totalMinor: '40000',
            shares: [{ membershipId: A, amountMinor: '10000' }],
          },
        ),
      ),
    ).toBe('SPLIT_MISMATCH');
  });

  it('refuses shares for someone who is not contributing to the month', () => {
    expect(
      codeOf(() =>
        resolveAmounts(
          ctx(),
          'recurring_shared',
          null,
          { mode: 'custom' },
          {
            entry: 'shares',
            shares: [
              {
                membershipId: 'cccccccc-0000-7000-8000-000000000003',
                amountMinor: '1',
              },
            ],
          },
        ),
      ),
    ).toBe('UNKNOWN_MEMBER');
  });

  it('proportional uses counted incomes only', () => {
    const r = resolveAmounts(
      ctx([income(A, 200000n), income(B, 300000n), income(B, 99999n, false)]),
      'recurring_shared',
      null,
      { mode: 'proportional' },
      { entry: 'total', totalMinor: '50000' },
    );
    expect(r.shares).toEqual({ [A]: 20000n, [B]: 30000n });
  });

  it('one payer keeps the payer', () => {
    const r = resolveAmounts(
      ctx(),
      'one_off_shared',
      null,
      { mode: 'one_payer', payerMembershipId: B },
      {
        entry: 'total',
        totalMinor: '6000',
      },
    );
    expect(r).toMatchObject({
      splitMode: 'one_payer',
      payerMembershipId: B,
      shares: { [A]: 0n, [B]: 6000n },
    });
  });

  it('refuses the wrong amount entry for a split', () => {
    expect(
      codeOf(() =>
        resolveAmounts(
          ctx(),
          'recurring_shared',
          null,
          { mode: 'custom' },
          { entry: 'total', totalMinor: '1' },
        ),
      ),
    ).toBe('VALIDATION_FAILED');
    expect(
      codeOf(() =>
        resolveAmounts(
          ctx(),
          'recurring_shared',
          null,
          { mode: 'equal' },
          {
            entry: 'shares',
            shares: [{ membershipId: A, amountMinor: '1' }],
          },
        ),
      ),
    ).toBe('VALIDATION_FAILED');
  });
});
