import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { BudgetDetail, MemberView, Role } from '@two-cents/shared/contracts';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

import i18n from '@/i18n';

import { budgetKeys } from './query-keys';

export const BUDGET_ID = '00000000-0000-7000-8000-0000000000b1';

export function member(overrides: Partial<MemberView> = {}): MemberView {
  return {
    membershipId: '00000000-0000-7000-8000-000000000001',
    userId: '00000000-0000-7000-8000-0000000000a1',
    displayName: 'Fabien',
    avatarKey: 'initials',
    colorKey: 'blue',
    role: 'owner',
    joinedAt: '2026-11-01T10:00:00.000Z',
    isMe: false,
    currentMonthIncome: null,
    ...overrides,
  };
}

export function budgetDetail(myRole: Role, overrides: Partial<BudgetDetail> = {}): BudgetDetail {
  return {
    id: BUDGET_ID,
    name: 'Maison Maëlle & Fabien',
    currency: 'EUR',
    myRole,
    memberCount: 2,
    lastOpenedAt: null,
    monthStartDay: 1,
    timeZone: 'Europe/Paris',
    currentMonth: { start: '2026-11-01', end: '2026-11-30' },
    pendingMonthStartDay: null,
    members: [member()],
    myIncomeMissing: myRole !== 'viewer',
    currencyLocked: false,
    ...overrides,
  };
}

/** Renders with French strings and a query cache already holding the budget. */
export function withProviders(detail: BudgetDetail, extra: [readonly unknown[], unknown][] = []) {
  void i18n.changeLanguage('fr');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  client.setQueryData(budgetKeys.detail(detail.id), detail);
  for (const [key, value] of extra) client.setQueryData(key, value);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
      </QueryClientProvider>
    );
  };
}
