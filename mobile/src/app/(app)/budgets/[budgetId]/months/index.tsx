import { useInfiniteQuery } from '@tanstack/react-query';
import type { MonthListItem } from '@two-cents/shared/contracts';
import { type Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Amount } from '@/components/amount';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { FontFamily, MinTouchTarget, Spacing } from '@/constants/theme';
import { formatMinor } from '@/features/budgets/format';
import { useBudget, useCan } from '@/features/budgets/use-can';
import { planningApi } from '@/features/planning/api';
import { monthTitle } from '@/features/planning/month-label';
import { OverrunBadge } from '@/features/planning/overrun-badge';
import { planningKeys } from '@/features/planning/query-keys';

/** Every month of the budget, newest first, with each member's "what's left" (US7, FR-008). */
export default function MonthListScreen() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId);
  const canCreate = useCan(budgetId, 'months.create');
  const canImport = useCan(budgetId, 'entries.write');
  const months = useInfiniteQuery({
    queryKey: planningKeys.months(budgetId),
    queryFn: ({ pageParam }) => planningApi.months(budgetId, pageParam ?? undefined),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = months.data?.pages.flatMap((p) => p.months) ?? [];
  const currency = budget.data?.currency ?? 'EUR';
  const name = (id: string) =>
    budget.data?.members.find((m) => m.membershipId === id)?.displayName ?? t('budgets.anonymousFormerMember');
  const go = (path: string) => router.push(path as Href);

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('planning.list.title') }} />
      {canCreate ? (
        <Button label={t('planning.list.newMonth')} onPress={() => go(`/budgets/${budgetId}/months/new`)} />
      ) : null}
      {canImport ? (
        <Button
          variant="secondary"
          label={t('planning.import.link')}
          onPress={() => go(`/budgets/${budgetId}/months/import`)}
        />
      ) : null}
      {months.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
      <ErrorBanner message={months.error ? errorMessage(t, months.error) : null} />
      {months.data && items.length === 0 ? (
        <ThemedText themeColor="textSecondary">{t('planning.list.empty')}</ThemedText>
      ) : null}
      {items.map((m) => (
        <MonthCard
          key={m.start}
          month={m}
          title={monthTitle(m, i18n.language)}
          currency={currency}
          name={name}
          a11yAmount={(minor) => formatMinor(minor, currency, i18n.language)}
          onOpen={() => go(`/budgets/${budgetId}/months/${m.start}`)}
          onUseAsBase={canCreate ? () => go(`/budgets/${budgetId}/months/new?from=${m.start}`) : undefined}
        />
      ))}
      {months.hasNextPage ? (
        <Button
          variant="secondary"
          label={t('planning.list.loadMore')}
          loading={months.isFetchingNextPage}
          onPress={() => void months.fetchNextPage()}
        />
      ) : null}
    </FormScreen>
  );
}

function MonthCard({
  month,
  title,
  currency,
  name,
  a11yAmount,
  onOpen,
  onUseAsBase,
}: {
  month: MonthListItem;
  title: string;
  currency: string;
  name: (id: string) => string;
  a11yAmount: (minor: string) => string;
  onOpen: () => void;
  onUseAsBase?: () => void;
}) {
  const { t } = useTranslation();
  const label = [
    title,
    t(`planning.status.${month.status}`),
    ...month.members.map(
      (s) =>
        `${t('planning.list.memberLeft', { name: name(s.membershipId), amount: a11yAmount(s.whatsLeftMinor) })}${
          s.overrun ? `, ${t('planning.overrun')}` : ''
        }`,
    ),
  ].join(', ');
  return (
    <Card>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onOpen}
        style={({ pressed }) => [styles.head, { opacity: pressed ? 0.7 : 1 }]}>
        <View style={styles.flex} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <ThemedText style={styles.title}>{title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t(`planning.status.${month.status}`)}
          </ThemedText>
          {month.members.map((s) => (
            <View key={s.membershipId} style={styles.member}>
              <ThemedText type="small" style={styles.flex}>
                {name(s.membershipId)}
              </ThemedText>
              {s.overrun ? <OverrunBadge /> : null}
              <Amount minor={s.whatsLeftMinor} currency={currency} type="smallBold" />
            </View>
          ))}
        </View>
        <Icon name="chevR" size={16} themeColor="textSecondary" />
      </Pressable>
      {onUseAsBase ? <Button variant="link" label={t('planning.list.useAsBase')} onPress={onUseAsBase} /> : null}
    </Card>
  );
}


const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget },
  flex: { flex: 1 },
  title: { fontSize: 16, lineHeight: 22, fontFamily: FontFamily.semibold },
  member: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: 28 },
});
