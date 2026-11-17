import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { IconLabel } from '@/components/ui';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { budgetsApi } from '@/features/budgets/api';
import { Card, SectionTitle } from '@/features/budgets/components';
import { formatDate } from '@/features/budgets/format';
import { budgetKeys } from '@/features/budgets/query-keys';
import { roleLabel } from '@/features/budgets/role-label';

/** US3 (FR-035): switch budgets in two taps, plus "Récemment supprimés" for the owner (FR-038a). */
export default function BudgetPicker() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { current } = useLocalSearchParams<{ current?: string }>();
  const mine = useQuery({ queryKey: budgetKeys.mine, queryFn: budgetsApi.mine });

  const go = (id: string) => {
    void Haptics.selectionAsync();
    void budgetsApi.open(id).then(() => queryClient.invalidateQueries({ queryKey: budgetKeys.mine }));
    router.dismissTo(`/budgets/${id}` as Href);
  };

  const restore = useMutation({
    mutationFn: budgetsApi.restore,
    onSuccess: async (budget) => {
      queryClient.setQueryData(budgetKeys.detail(budget.id), budget);
      await queryClient.invalidateQueries({ queryKey: budgetKeys.mine });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.dismissTo(`/budgets/${budget.id}` as Href);
    },
  });

  return (
    <FormScreen>
      {mine.data?.budgets.map((b) => {
        const active = b.id === current;
        const label = `${b.name}, ${roleLabel(t, b.myRole)}, ${t('budgets.picker.people', { count: b.memberCount })}${active ? `, ${t('budgets.picker.active')}` : ''}`;
        return (
          <Pressable
            key={b.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => go(b.id)}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: theme.backgroundElement, borderColor: active ? theme.primary : 'transparent', opacity: pressed ? 0.8 : 1 },
            ]}>
            <View style={styles.rowText}>
              <ThemedText type="smallBold">{b.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {roleLabel(t, b.myRole)} · {t('budgets.picker.people', { count: b.memberCount })}
              </ThemedText>
            </View>
            {active ? (
              <IconLabel icon="check" label={t('budgets.picker.active')} color={theme.primary} />
            ) : null}
          </Pressable>
        );
      })}
      <Button label={t('budgets.picker.create')} variant="secondary" onPress={() => router.push('/budgets/new' as Href)} />
      <Button label={t('budgets.picker.join')} variant="link" onPress={() => router.push('/onboarding/join-code' as Href)} />

      {mine.data && mine.data.recentlyDeleted.length > 0 ? (
        <>
          <SectionTitle>{t('budgets.picker.recentlyDeleted')}</SectionTitle>
          {mine.data.recentlyDeleted.map((d) => (
            <Card key={d.id}>
              <ThemedText type="smallBold">{d.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('budgets.picker.deletedOn', {
                  date: formatDate(d.deletedAt, i18n.language),
                  until: formatDate(d.purgeAt, i18n.language),
                })}
              </ThemedText>
              <Button
                label={t('budgets.picker.restore')}
                variant="secondary"
                loading={restore.isPending && restore.variables === d.id}
                onPress={() => restore.mutate(d.id)}
              />
            </Card>
          ))}
        </>
      ) : null}
      <ErrorBanner message={restore.error ? errorMessage(t, restore.error) : mine.error ? errorMessage(t, mine.error) : null} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: 2,
    minHeight: MinTouchTarget + Spacing.three,
  },
  rowText: { flex: 1, gap: Spacing.half },
});
