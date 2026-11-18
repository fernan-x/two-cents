import { useQueryClient } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ApiError } from '@/auth/api-client';
import { errorMessage } from '@/auth/error-message';
import { Button, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useBudget } from '@/features/budgets/use-can';
import { planningApi } from '@/features/planning/api';
import { askClosedMonth } from '@/features/tracking/closed-month-dialog';
import { todayIn , monthStartOf } from '@/features/tracking/month-of';
import { type CreateVars, runTrackingMutation } from '@/features/tracking/mutations';
import { SyncBadge } from '@/features/tracking/tracking-cards';
import { useSyncState } from '@/features/tracking/use-sync-state';

/**
 * Writes the server refused (US3, FR-016): never dropped silently. A closed month offers to reopen
 * or move the expense to this month; anything else can be retried or abandoned.
 */
export default function PendingScreen() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId).data;
  const { pending, failed } = useSyncState();
  const mine = failed.filter((m) => (m.state.variables as { budgetId?: string } | undefined)?.budgetId === budgetId);

  const retry = (m: (typeof failed)[number]) => {
    const vars = m.state.variables as CreateVars;
    client.getMutationCache().remove(m);
    const kind = (m.options.mutationKey?.[1] ?? 'create') as Parameters<typeof runTrackingMutation>[1];
    void runTrackingMutation(client, kind, vars).catch(() => undefined);
  };

  const resolveClosed = async (m: (typeof failed)[number], error: ApiError) => {
    const vars = m.state.variables as CreateVars;
    const choice = await askClosedMonth(t, !!error.details.canReopen);
    if (choice === 'cancel' || !budget) return;
    if (choice === 'reopen' && error.details.monthStart) {
      try {
        await planningApi.changeStatus(budgetId, error.details.monthStart, { action: 'reopen' });
      } catch {
        return;
      }
      retry(m);
      return;
    }
    const today = todayIn(budget.timeZone);
    client.getMutationCache().remove(m);
    void runTrackingMutation<CreateVars>(client, 'create', {
      ...vars,
      monthStart: monthStartOf(budget, today),
      // Parts point to the closed month's lines: recorded unassigned this month, to review.
      body: { ...vars.body, date: today, parts: [] },
    }).catch(() => undefined);
  };

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('tracking.toResolve') }} />
      {pending.length ? <SyncBadge /> : null}
      {mine.length === 0 ? <ThemedText themeColor="textSecondary">{t('tracking.list.empty')}</ThemedText> : null}
      {mine.map((m) => {
        const vars = m.state.variables as Partial<CreateVars>;
        const error = m.state.error;
        const closed = error instanceof ApiError && error.code === 'MONTH_CLOSED';
        return (
          <Card key={m.mutationId}>
            <ThemedText type="smallBold">{vars.body?.label ?? t('tracking.detail.title')}</ThemedText>
            <ThemedText type="small" themeColor="danger">
              {errorMessage(t, error)}
            </ThemedText>
            <View style={styles.row}>
              {closed ? (
                <Button label={t('tracking.closedMonth.title')} onPress={() => void resolveClosed(m, error)} />
              ) : (
                <Button label={t('tracking.sync.retry')} onPress={() => retry(m)} />
              )}
              <Button label={t('tracking.sync.discard')} variant="secondary" onPress={() => client.getMutationCache().remove(m)} />
            </View>
          </Card>
        );
      })}
    </FormScreen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' } });
