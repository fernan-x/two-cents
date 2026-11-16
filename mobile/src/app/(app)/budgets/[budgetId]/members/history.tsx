import { useInfiniteQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { budgetsApi } from '@/features/budgets/api';
import { Card } from '@/features/budgets/components';
import { formatDate } from '@/features/budgets/format';
import { budgetKeys } from '@/features/budgets/query-keys';

/** FR-034: who joined, left, changed roles or settings, and when (owner and Admins). */
export default function History() {
  const { t, i18n } = useTranslation();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const events = useInfiniteQuery({
    queryKey: budgetKeys.events(budgetId),
    queryFn: ({ pageParam }) => budgetsApi.events(budgetId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const all = events.data?.pages.flatMap((p) => p.events) ?? [];
  const someone = t('budgets.history.someone');

  return (
    <FormScreen>
      {events.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
      {events.data && all.length === 0 ? <ThemedText>{t('budgets.history.empty')}</ThemedText> : null}
      {all.map((e) => (
        <Card key={e.id}>
          <ThemedText>
            {t(`budgets.history.events.${e.type}`, {
              actor: e.actorName ?? someone,
              target: e.targetName ?? t('budgets.anonymousFormerMember'),
            })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDate(e.createdAt, i18n.language)}
          </ThemedText>
        </Card>
      ))}
      <ErrorBanner message={events.error ? errorMessage(t, events.error) : null} />
      {events.hasNextPage ? (
        <Button
          label={t('budgets.history.more')}
          variant="link"
          loading={events.isFetchingNextPage}
          onPress={() => void events.fetchNextPage()}
        />
      ) : null}
    </FormScreen>
  );
}
