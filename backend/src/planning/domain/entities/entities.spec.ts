import { BudgetLine, type BudgetLineProps } from './budget-line';
import { BudgetMonth } from './budget-month';
import { IncomeLine } from './income-line';

const now = new Date('2026-11-16T10:00:00Z');
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as { code?: string }).code ?? (e as Error).message;
  }
  return null;
};

const A = 'aaaaaaaa-0000-7000-8000-000000000001';
const B = 'bbbbbbbb-0000-7000-8000-000000000002';

const shared = (over: Partial<BudgetLineProps> = {}): BudgetLineProps => ({
  id: 'line',
  monthId: 'month',
  budgetId: 'budget',
  seriesId: 'series',
  group: 'recurring_shared',
  kind: 'expense',
  label: 'Courses',
  categoryId: null,
  isEnvelope: false,
  ownerMembershipId: null,
  isPrivate: false,
  splitMode: 'custom',
  payerMembershipId: null,
  totalMinor: 40000n,
  shares: { [A]: 10000n, [B]: 30000n },
  formula: null,
  currency: 'EUR',
  position: 0,
  version: 1,
  handEdited: false,
  usual: null,
  needsReview: false,
  needsIncome: false,
  subItems: [],
  createdAt: now,
  createdBy: A,
  updatedAt: now,
  updatedBy: A,
  ...over,
});

describe('BudgetLine invariants (data-model.md)', () => {
  it('accepts a valid shared line', () => {
    expect(BudgetLine.create(shared()).totalMinor).toBe(40000n);
  });

  it('a personal line has an owner, no split and only its owner share', () => {
    const personal = shared({
      group: 'personal',
      ownerMembershipId: A,
      splitMode: null,
      totalMinor: 1500n,
      shares: { [A]: 1500n },
    });
    expect(BudgetLine.create(personal).group).toBe('personal');
    expect(
      code(() => BudgetLine.create({ ...personal, ownerMembershipId: null })),
    ).toMatch(/owner/);
    expect(
      code(() => BudgetLine.create({ ...personal, splitMode: 'custom' })),
    ).toMatch(/split/);
    expect(
      code(() => BudgetLine.create({ ...personal, shares: { [B]: 1500n } })),
    ).toMatch(/owner share/);
  });

  it('only personal lines can be private', () => {
    expect(code(() => BudgetLine.create(shared({ isPrivate: true })))).toBe(
      'VALIDATION_FAILED',
    );
  });

  it('one_payer needs a payer, and only then', () => {
    expect(
      code(() => BudgetLine.create(shared({ splitMode: 'one_payer' }))),
    ).toMatch(/payer/);
    expect(
      code(() => BudgetLine.create(shared({ payerMembershipId: A }))),
    ).toMatch(/payer/);
  });

  it('shares must add up to the total', () => {
    expect(
      code(() => BudgetLine.create(shared({ totalMinor: 40001n }))),
    ).toMatch(/add up/);
  });

  it('refuses negative or too large totals', () => {
    expect(
      code(() =>
        BudgetLine.create(shared({ totalMinor: -1n, shares: { [A]: -1n } })),
      ),
    ).toBe('INVALID_AMOUNT');
    expect(
      code(() =>
        BudgetLine.create(
          shared({ totalMinor: 100_000_001n, shares: { [A]: 100_000_001n } }),
        ),
      ),
    ).toBe('AMOUNT_TOO_LARGE');
  });

  it('every update bumps the version (research R5)', () => {
    const line = BudgetLine.create(shared());
    line.update({ label: 'Courses bio' }, B, now);
    expect(line.version).toBe(2);
    expect(line.label).toBe('Courses bio');
  });
});

describe('BudgetMonth status (FR-002, FR-036)', () => {
  const month = () =>
    BudgetMonth.create({
      id: 'm',
      budgetId: 'b',
      period: { start: '2026-11-01', end: '2026-11-30' },
      createdFrom: 'scratch',
      by: A,
      now,
    });

  it('starts in draft and goes draft → active → closed → active', () => {
    const m = month();
    expect(m.status).toBe('draft');
    m.changeStatus('activate', A, now);
    expect(m.activatedAt).toEqual(now);
    m.changeStatus('close', A, now, { members: [] });
    expect(m.status).toBe('closed');
    expect(code(() => m.assertWritable())).toBe('MONTH_CLOSED');
    m.changeStatus('reopen', A, now);
    expect(m.status).toBe('active');
    expect(m.closedSummary).toBeNull();
  });

  it('refuses other transitions', () => {
    expect(code(() => month().changeStatus('close', A, now, {}))).toBe(
      'INVALID_TRANSITION',
    );
    expect(code(() => month().changeStatus('reopen', A, now))).toBe(
      'INVALID_TRANSITION',
    );
  });
});

describe('IncomeLine (FR-009)', () => {
  const income = () =>
    IncomeLine.create({
      id: 'i',
      monthId: 'm',
      membershipId: A,
      label: 'Salaire',
      amountMinor: 200000n,
      currency: 'EUR',
      countsTowardHousehold: true,
      toConfirm: true,
      isPrimary: true,
      position: 0,
      version: 1,
      createdAt: now,
      createdBy: A,
      updatedAt: now,
      updatedBy: A,
    });

  it('an edit confirms a pre-filled income and bumps the version', () => {
    const i = income();
    i.update({ amountMinor: 210000n }, A, now);
    expect(i.toConfirm).toBe(false);
    expect(i.version).toBe(2);
  });

  it('confirm is a no-op once confirmed', () => {
    const i = income();
    expect(i.confirm(A, now)).toBe(true);
    expect(i.confirm(A, now)).toBe(false);
  });

  it('refuses amounts out of range', () => {
    expect(code(() => income().update({ amountMinor: -1n }, A, now))).toBe(
      'INVALID_AMOUNT',
    );
    expect(
      code(() => income().update({ amountMinor: 100_000_001n }, A, now)),
    ).toBe('AMOUNT_TOO_LARGE');
  });
});
