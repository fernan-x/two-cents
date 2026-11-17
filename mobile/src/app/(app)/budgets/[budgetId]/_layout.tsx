import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useBudgetAccess } from '@/features/budgets/use-budget-access';

/** Every screen of one budget; leaves it as soon as the person loses access (FR-031). */
export default function BudgetLayout() {
  const { t } = useTranslation();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  useBudgetAccess(budgetId);
  return (
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
    </Stack>
  );
}
