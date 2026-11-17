import { useInfiniteQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { formatDate } from '@/features/budgets/format';
import { useBudget } from '@/features/budgets/use-can';
import { planningApi } from '@/features/planning/api';
import { historySentence } from '@/features/planning/history-sentence';
import { planningKeys } from '@/features/planning/query-keys';
import { useTheme } from '@/hooks/use-theme';

/**
 * A month's change history (US5, FR-035): changes since the plan was agreed, or everything with
 * "Tout afficher". Private lines of others only say that a private line changed.
 */
export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { budgetId, monthStart } = useLocalSearchParams<{ budgetId: string; monthStart: string }>();
  const budget = useBudget(budgetId);
  const [all, setAll] = useState(false);
  const history = useInfiniteQuery({
    queryKey: planningKeys.history(budgetId, monthStart, all),
    queryFn: ({ pageParam }) => planningApi.history(budgetId, monthStart, { cursor: pageParam ?? undefined, all }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const changes = history.data?.pages.flatMap((p) => p.changes) ?? [];
  const currency = budget.data?.currency ?? 'EUR';

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('planning.history.title') }} />
      <View style={styles.switchRow}>
        <ThemedText type="smallBold" style={styles.flex}>
          {t('planning.history.showAll')}
        </ThemedText>
        <Switch
          accessibilityLabel={t('planning.history.showAll')}
          value={all}
          onValueChange={setAll}
          trackColor={{ true: theme.primary, false: theme.track }}
        />
      </View>
      {history.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
      <ErrorBanner message={history.error ? errorMessage(t, history.error) : null} />
      {history.data && changes.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t('planning.history.empty')}</ThemedText>
      ) : null}
      {changes.length > 0 ? (
        <Card style={styles.list}>
          {changes.map((c, i) => {
            const sentence = historySentence(c, { t, currency, language: i18n.language });
            const date = formatDate(c.at, i18n.language);
            return (
              <View
                key={c.id}
                accessible
                accessibilityLabel={t('planning.history.a11y', { sentence, date })}
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}>
                <Icon name={c.private ? 'lock' : 'clock'} size={16} themeColor="textSecondary" />
                <View style={styles.flex}>
                  <ThemedText>{sentence}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {date}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}
      {history.hasNextPage ? (
        <Button
          variant="secondary"
          label={t('planning.history.loadMore')}
          loading={history.isFetchingNextPage}
          onPress={() => void history.fetchNextPage()}
        />
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget },
  list: { paddingVertical: Spacing.two, gap: 0 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two, minHeight: MinTouchTarget, paddingVertical: Spacing.two },
  flex: { flex: 1 },
});
