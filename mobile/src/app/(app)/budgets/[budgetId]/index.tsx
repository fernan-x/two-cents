import { useQueryClient } from '@tanstack/react-query';
import { type Href, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { budgetsApi } from '@/features/budgets/api';
import { Card, MemberRow } from '@/features/budgets/components';
import { formatDay } from '@/features/budgets/format';
import { budgetKeys } from '@/features/budgets/query-keys';
import { useBudget, useCan } from '@/features/budgets/use-can';

/** The budget's home: who is in it and the current budget month. Later features add lines and spending. */
export default function BudgetHome() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId);
  const canEditSettings = useCan(budgetId, 'budget.settings.edit');

  // FR-036: this is now the budget to reopen, on every device.
  useFocusEffect(
    useCallback(() => {
      void budgetsApi
        .open(budgetId)
        .then(() => queryClient.invalidateQueries({ queryKey: budgetKeys.mine }))
        .catch(() => undefined);
    }, [budgetId, queryClient]),
  );

  const data = budget.data;
  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: data?.name ?? '',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('budgets.home.switch')}
              hitSlop={8}
              style={styles.headerButton}
              onPress={() => router.push(`/budgets/picker?current=${budgetId}` as Href)}>
              <ThemedText style={{ color: theme.primary }}>⇄</ThemedText>
            </Pressable>
          ),
        }}
      />
      {budget.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
      <ErrorBanner message={budget.error ? errorMessage(t, budget.error) : null} />
      {data ? (
        <>
          <ThemedText type="subtitle" accessibilityRole="header">
            {data.name}
          </ThemedText>
          <ThemedText themeColor="textSecondary">
            {t('budgets.month', {
              start: formatDay(data.currentMonth.start, i18n.language),
              end: formatDay(data.currentMonth.end, i18n.language),
            })}
          </ThemedText>

          {data.myIncomeMissing ? (
            <View
              style={[styles.reminder, { backgroundColor: theme.warningBackground }]}
              accessibilityRole="summary">
              <ThemedText style={{ color: theme.warningText }}>{t('budgets.home.incomeReminder')}</ThemedText>
              <Button
                label={t('budgets.home.incomeReminderAction')}
                variant="link"
                onPress={() => router.push(`/budgets/${budgetId}/income` as Href)}
              />
            </View>
          ) : null}

          <Card accessibilityLabel={t('budgets.home.members')}>
            {data.members.map((m) => (
              <MemberRow key={m.membershipId} member={m} />
            ))}
          </Card>
          <Button
            label={t('budgets.home.members')}
            variant="secondary"
            onPress={() => router.push(`/budgets/${budgetId}/members` as Href)}
          />
          <Button
            label={t('budgets.home.settings')}
            variant={canEditSettings ? 'secondary' : 'link'}
            onPress={() => router.push(`/budgets/${budgetId}/settings` as Href)}
          />
          <Button label={t('budgets.home.account')} variant="link" onPress={() => router.push('/settings')} />
        </>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  headerButton: { minWidth: MinTouchTarget, minHeight: MinTouchTarget, alignItems: 'center', justifyContent: 'center' },
  reminder: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
});
