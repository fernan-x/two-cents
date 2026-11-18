import { type Href, router } from 'expo-router';
import { Pressable } from 'react-native';

import { useMonth } from '@/features/planning/use-month';

import { BalanceCard } from './tracking-cards';
import { useServerTracking } from './use-tracking';

/** The month's open balances on the budget home (US6); nothing when everyone is even. */
export function HomeBalance({ budgetId, monthStart }: { budgetId: string; monthStart: string }) {
  const tracking = useServerTracking(budgetId, monthStart);
  const month = useMonth(budgetId, monthStart);
  const balances = tracking.data?.balances ?? [];
  if (!balances.length || !month.data) return null;
  const nameOf = (id: string) => month.data?.members.find((m) => m.membershipId === id)?.displayName ?? '';
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/budgets/${budgetId}/months/${monthStart}/tracking` as Href)}>
      <BalanceCard balances={balances} nameOf={nameOf} currency={month.data.currency} />
    </Pressable>
  );
}
