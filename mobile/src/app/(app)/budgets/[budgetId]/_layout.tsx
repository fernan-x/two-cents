import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useBudgetAccess } from '@/features/budgets/use-budget-access';
import { QuickAddButton } from '@/features/tracking/quick-add-button';
import { View } from 'react-native';

/** Every screen of one budget; leaves it as soon as the person loses access (FR-031). */
export default function BudgetLayout() {
  const { t } = useTranslation();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  useBudgetAccess(budgetId);
  return (
    <View style={{ flex: 1 }}>
    <Stack screenOptions={{ headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen name="income" options={{ title: t('budgets.income.title') }} />
      <Stack.Screen name="members/index" options={{ title: t('budgets.members.title') }} />
      <Stack.Screen name="members/invite" options={{ title: t('budgets.invite.title'), presentation: 'modal' }} />
      <Stack.Screen name="members/[membershipId]" options={{ title: '' }} />
      <Stack.Screen name="members/history" options={{ title: t('budgets.history.title') }} />
      <Stack.Screen name="settings/index" options={{ title: t('budgets.settings.title') }} />
      <Stack.Screen name="settings/delete" options={{ title: t('budgets.delete.title') }} />
      <Stack.Screen name="months/[monthStart]/index" options={{ title: t('planning.month.title') }} />
      <Stack.Screen
        name="months/[monthStart]/line"
        options={{
          title: t('planning.line.newTitle'),
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.92],
        }}
      />
      <Stack.Screen name="months/[monthStart]/income" options={{ title: t('planning.income.title') }} />
      <Stack.Screen name="months/[monthStart]/history" options={{ title: t('planning.history.title') }} />
      <Stack.Screen name="months/index" options={{ title: t('planning.list.title') }} />
      <Stack.Screen name="months/new" options={{ title: t('planning.new.title'), presentation: 'modal' }} />
      <Stack.Screen name="months/templates" options={{ title: t('planning.templates.title') }} />
      <Stack.Screen name="months/categories" options={{ title: t('planning.categoriesScreen.title') }} />
      <Stack.Screen name="months/import/index" options={{ title: t('planning.import.title') }} />
      <Stack.Screen name="months/import/preview" options={{ title: t('planning.import.previewTitle') }} />
      {/* Spec 004 */}
      <Stack.Screen
        name="transactions/new"
        options={{
          title: t('tracking.quickAdd.title'),
          presentation: 'formSheet',
          sheetGrabberVisible: true,
          sheetAllowedDetents: [0.92],
        }}
      />
      <Stack.Screen name="transactions/[txnId]" options={{ title: t('tracking.detail.title') }} />
      <Stack.Screen name="transactions/pending" options={{ title: t('tracking.toResolve') }} />
      <Stack.Screen name="transactions/import/index" options={{ title: t('tracking.import.title') }} />
      <Stack.Screen name="transactions/import/review" options={{ title: t('tracking.import.review') }} />
      <Stack.Screen name="recurring/index" options={{ title: t('tracking.recurring.title') }} />
      <Stack.Screen name="recurring/edit" options={{ title: t('tracking.recurring.edit'), presentation: 'modal' }} />
      <Stack.Screen name="months/[monthStart]/tracking" options={{ title: t('tracking.screen.title') }} />
      <Stack.Screen name="months/[monthStart]/transactions" options={{ title: t('tracking.list.title') }} />
      <Stack.Screen name="months/[monthStart]/envelope/[lineId]" options={{ title: '' }} />
    </Stack>
    {/* US1 FR-007: the persistent "+" over every main screen of the budget. */}
    <QuickAddButton budgetId={budgetId} />
    </View>
  );
}
