import type { LineView, MonthDetail } from '@two-cents/shared/contracts';

import { liveSummary } from './use-live-summary';

const MAELLE = '00000000-0000-7000-8000-00000000000a';
const FABIEN = '00000000-0000-7000-8000-00000000000b';

const line = (id: string, label: string, m: string, f: string, over: Partial<LineView> = {}): LineView => ({
  id,
  seriesId: id,
  group: 'recurring_shared',
  kind: 'expense',
  label,
  categoryId: null,
  isEnvelope: false,
  subItems: [],
  ownerMembershipId: null,
  isPrivate: false,
  splitMode: 'custom',
  payerMembershipId: null,
  totalMinor: String(BigInt(m) + BigInt(f)),
  shares: [
    { membershipId: MAELLE, amountMinor: m },
    { membershipId: FABIEN, amountMinor: f },
  ],
  formula: null,
  position: 0,
  version: 1,
  isException: false,
  usualTotalMinor: null,
  needsReview: false,
  needsIncome: false,
  editable: true,
  ...over,
});

const COURSES = '00000000-0000-7000-8000-0000000000c1';

function detail(courses: [string, string]): MonthDetail {
  const base: MonthDetail = {
    month: {
      start: '2026-11-01',
      end: '2026-11-30',
      status: 'draft',
      revision: '3',
      createdFrom: 'scratch',
      activatedAt: null,
      closedAt: null,
    },
    currency: 'EUR',
    members: [
      { membershipId: MAELLE, displayName: 'Maëlle', formerMember: false, isMe: false, order: 0 },
      { membershipId: FABIEN, displayName: 'Fabien', formerMember: false, isMe: true, order: 1 },
    ],
    incomes: [
      {
        id: '00000000-0000-7000-8000-0000000000e1',
        membershipId: MAELLE,
        label: null,
        amountMinor: '200000',
        countsTowardHousehold: true,
        toConfirm: false,
        isPrimary: true,
        position: 0,
        version: 1,
        editable: false,
      },
      {
        id: '00000000-0000-7000-8000-0000000000e2',
        membershipId: FABIEN,
        label: null,
        amountMinor: '299000',
        countsTowardHousehold: true,
        toConfirm: false,
        isPrimary: true,
        position: 0,
        version: 1,
        editable: true,
      },
    ],
    lines: [
      line('00000000-0000-7000-8000-0000000000c0', 'Loyer', '95000', '95000'),
      line(COURSES, 'Courses', courses[0], courses[1]),
    ],
    privateAggregates: [{ membershipId: MAELLE, totalMinor: '6000', savingsMinor: '0', count: 1 }],
    summary: null as never,
    actuals: null,
    flags: { incomesToConfirm: [], linesNeedReview: [], linesNeedIncome: [] },
    can: { editShared: true, changeStatus: ['activate'] },
  };
  return { ...base, summary: liveSummary(base) };
}

const fabien = (d: MonthDetail['summary']) => d.members.find((m) => m.membershipId === FABIEN)!;

describe('liveSummary (T050, FR-031)', () => {
  it('applies an unsaved edit to the summary at once', () => {
    const saved = detail(['10000', '30000']);
    expect(fabien(saved.summary).whatsLeftMinor).toBe(String(299000 - 95000 - 30000));

    const draft = liveSummary(saved, {
      line: {
        id: COURSES,
        group: 'recurring_shared',
        kind: 'expense',
        shares: [
          { membershipId: MAELLE, amountMinor: '10000' },
          { membershipId: FABIEN, amountMinor: '40000' },
        ],
      },
    });
    expect(fabien(draft).whatsLeftMinor).toBe(String(299000 - 95000 - 40000));
    // Same figures as the month once the edit is saved.
    expect(draft).toEqual(detail(['10000', '40000']).summary);
  });

  it('counts private aggregates and adds a new draft line', () => {
    const saved = detail(['10000', '30000']);
    const maelle = saved.summary.members.find((m) => m.membershipId === MAELLE)!;
    expect(maelle.diMinor).toBe('6000');
    const withNew = liveSummary(saved, {
      line: { group: 'one_off_shared', kind: 'expense', shares: [{ membershipId: MAELLE, amountMinor: '500' }] },
    });
    expect(withNew.members.find((m) => m.membershipId === MAELLE)!.dceMinor).toBe('500');
  });

  it('applies an income draft', () => {
    const saved = detail(['10000', '30000']);
    const s = liveSummary(saved, {
      income: { id: '00000000-0000-7000-8000-0000000000e2', membershipId: FABIEN, amountMinor: '300000', countsTowardHousehold: true },
    });
    expect(fabien(s).countedIncomeMinor).toBe('300000');
  });
});
