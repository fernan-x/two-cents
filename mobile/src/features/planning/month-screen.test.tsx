import type { LineView, MonthDetail } from '@two-cents/shared/contracts';
import { render, screen } from '@testing-library/react-native';

import { BUDGET_ID, budgetDetail, withProviders } from '@/features/budgets/test-utils';
import { planningKeys } from '@/features/planning/query-keys';
import { liveSummary } from '@/features/planning/use-live-summary';

import MonthScreen from '@/app/(app)/budgets/[budgetId]/months/[monthStart]/index';

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useIsFocused: () => false,
  useLocalSearchParams: () => ({ budgetId: '00000000-0000-7000-8000-0000000000b1', monthStart: '2026-11-01' }),
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/features/planning/api', () => ({ planningApi: {} }));

const MAELLE = '00000000-0000-7000-8000-00000000000a';
const FABIEN = '00000000-0000-7000-8000-00000000000b';

const line = (over: Partial<LineView>): LineView => ({
  id: '00000000-0000-7000-8000-0000000000c1',
  seriesId: '00000000-0000-7000-8000-0000000000c1',
  group: 'recurring_shared',
  kind: 'expense',
  label: 'Loyer',
  categoryId: null,
  isEnvelope: false,
  subItems: [],
  ownerMembershipId: null,
  isPrivate: false,
  splitMode: 'custom',
  payerMembershipId: null,
  totalMinor: '190000',
  shares: [
    { membershipId: MAELLE, amountMinor: '95000' },
    { membershipId: FABIEN, amountMinor: '95000' },
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

function month(editable: boolean): MonthDetail {
  const base: MonthDetail = {
    month: {
      start: '2026-11-01',
      end: '2026-11-30',
      status: 'draft',
      revision: '1',
      createdFrom: 'scratch',
      activatedAt: null,
      closedAt: null,
    },
    currency: 'EUR',
    members: [
      { membershipId: MAELLE, displayName: 'Maëlle', formerMember: false, isMe: editable, order: 0 },
      { membershipId: FABIEN, displayName: 'Fabien', formerMember: false, isMe: false, order: 1 },
    ],
    incomes: [
      {
        id: '00000000-0000-7000-8000-0000000000e1',
        membershipId: MAELLE,
        label: null,
        amountMinor: '90000',
        countsTowardHousehold: true,
        toConfirm: false,
        isPrimary: true,
        position: 0,
        version: 1,
        editable,
      },
    ],
    lines: [
      line({ editable }),
      line({
        id: '00000000-0000-7000-8000-0000000000c2',
        group: 'personal',
        label: 'Escalade',
        ownerMembershipId: FABIEN,
        splitMode: null,
        totalMinor: '5500',
        shares: [{ membershipId: FABIEN, amountMinor: '5500' }],
        editable: false,
      }),
    ],
    privateAggregates: [],
    summary: null as never,
    actuals: null,
    flags: { incomesToConfirm: [], linesNeedReview: [], linesNeedIncome: [] },
    can: { editShared: editable, changeStatus: editable ? ['activate'] : [] },
  };
  return { ...base, summary: liveSummary(base) };
}

const renderMonth = (editable: boolean) =>
  render(<MonthScreen />, {
    wrapper: withProviders(budgetDetail(editable ? 'member' : 'viewer'), [
      [planningKeys.month(BUDGET_ID, '2026-11-01'), month(editable)],
    ]),
  });

describe('Month screen (US1)', () => {
  it('shows the overrun with an icon and a word, not color alone (FR-032)', async () => {
    await renderMonth(true);
    // Maëlle: 900 € income, 950 € rent → −50 €.
    expect(screen.getAllByLabelText('Dépassement').length).toBeGreaterThan(0);
    expect(screen.getByText('Communes récurrentes (DCR)')).toBeTruthy();
  });

  it('a member can add lines in shared groups and her own DI only', async () => {
    await renderMonth(true);
    expect(screen.getAllByLabelText('Ajouter une ligne')).toHaveLength(3); // her DI, DCR, DCE
    expect(screen.getByRole('button', { name: /Loyer/ })).toBeTruthy();
    // Fabien's personal line is read-only for her (FR-018).
    expect(screen.queryByRole('button', { name: /Escalade/ })).toBeNull();
    expect(screen.getByLabelText(/Escalade.*lecture seule/)).toBeTruthy();
  });

  it('a viewer sees everything read-only', async () => {
    await renderMonth(false);
    expect(screen.queryByLabelText('Ajouter une ligne')).toBeNull();
    expect(screen.queryByRole('button', { name: /Loyer/ })).toBeNull();
    expect(screen.getByText('Lecture seule')).toBeTruthy();
  });
});
