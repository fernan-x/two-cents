import { useQueryClient } from '@tanstack/react-query';
import { daysBetween, localDateIn } from '@two-cents/shared/domain';
import { type Href, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Icon } from '@/components/icon';
import { HomeBalance } from '@/features/tracking/home-balance';
import { Card as UiCard, HeroCard, IconBubble, ListRow, SectionHeader } from '@/components/ui';
import { FontFamily, MinTouchTarget, Spacing } from '@/constants/theme';
import { budgetsApi } from '@/features/budgets/api';
import { Card, MemberRow } from '@/features/budgets/components';
import { formatDay, formatMoney, sumMoney } from '@/features/budgets/format';
import { budgetKeys } from '@/features/budgets/query-keys';
import { useBudget, useCan } from '@/features/budgets/use-can';

/** Members shown on the home card before "See all". */
const MEMBER_PREVIEW = 3;

/** The budget's home: who is in it and the current budget month. Later features add lines and spending. */
export default function BudgetHome() {
  const { t, i18n } = useTranslation();
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
  const goTo = (path: string) => router.push(path as Href);

  let hero = null;
  if (data) {
    const { start, end } = data.currentMonth;
    const today = localDateIn(new Date(), data.timeZone);
    const totalDays = daysBetween(start, end) + 1;
    const daysLeft = Math.max(0, daysBetween(today, end) + 1);
    const earners = data.members.filter((m) => m.role !== 'viewer');
    const entered = earners.filter((m) => m.currentMonthIncome != null).length;
    const amount = formatMoney(
      sumMoney(
        earners.map((m) => m.currentMonthIncome),
        data.currency,
      ),
      i18n.language,
    );
    const days = t('budgets.home.daysLeft', { count: daysLeft });
    const enteredText = t('budgets.home.incomeEntered', { entered, total: earners.length });
    hero = (
      <HeroCard
        label={t('budgets.home.monthLabel', {
          start: formatDay(start, i18n.language),
          end: formatDay(end, i18n.language),
        })}
        amount={amount}
        amountSuffix={t('budgets.home.householdIncome')}
        progress={(totalDays - daysLeft) / totalDays}
        footerStart={enteredText}
        footerEnd={days}
        accessibilityLabel={t('budgets.home.heroA11y', { name: data.name, amount, days, entered: enteredText })}
      />
    );
  }

  return (
    <FormScreen>
      <Stack.Screen
        options={{
          title: '',
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('budgets.home.switch')}
              hitSlop={8}
              style={styles.headerButton}
              onPress={() => goTo(`/budgets/picker?current=${budgetId}`)}>
              <Icon name="switch" size={22} themeColor="primary" />
            </Pressable>
          ),
        }}
      />
      {budget.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
      <ErrorBanner message={budget.error ? errorMessage(t, budget.error) : null} />
      {data ? (
        <>
          <ThemedText accessibilityRole="header" style={styles.title}>
            {data.name}
          </ThemedText>
          {hero}

          {data.myIncomeMissing ? (
            <UiCard style={styles.reminder}>
              <View style={styles.reminderRow} accessible accessibilityRole="summary">
                <IconBubble icon="alert" tone="warning" />
                <ThemedText style={styles.reminderText}>{t('budgets.home.incomeReminder')}</ThemedText>
              </View>
              <Button
                label={t('budgets.home.incomeReminderAction')}
                onPress={() => goTo(`/budgets/${budgetId}/income`)}
              />
            </UiCard>
          ) : null}

          <SectionHeader
            title={t('budgets.home.members')}
            action={data.members.length > MEMBER_PREVIEW ? t('budgets.home.seeAll') : t('budgets.home.manage')}
            onAction={() => goTo(`/budgets/${budgetId}/members`)}
          />
          <Card accessibilityLabel={t('budgets.home.members')}>
            {data.members.slice(0, MEMBER_PREVIEW).map((m) => (
              <MemberRow key={m.membershipId} member={m} />
            ))}
          </Card>

          {/* Spec 004 US6: an open balance between members shows on the budget home. */}
          <HomeBalance budgetId={budgetId} monthStart={data.currentMonth.start} />
          <UiCard style={styles.links}>
            <ListRow
              icon="chart"
              tone="primary"
              title={t('planning.month.homeEntry')}
              detail={t('planning.month.homeEntryDetail')}
              onPress={() => goTo(`/budgets/${budgetId}/months/${data.currentMonth.start}`)}
            />
            <ListRow
              divider
              icon="trend"
              tone="primary"
              title={t('tracking.screen.openTracking')}
              onPress={() => goTo(`/budgets/${budgetId}/months/${data.currentMonth.start}/tracking`)}
            />
            <ListRow
              divider
              icon="calendar"
              tone="primary"
              title={t('planning.month.allMonths')}
              onPress={() => goTo(`/budgets/${budgetId}/months`)}
            />
            <ListRow
              divider
              icon="users"
              tone="info"
              title={t('budgets.home.members')}
              detail={t('budgets.home.membersDetail', { count: data.members.length })}
              onPress={() => goTo(`/budgets/${budgetId}/members`)}
            />
            <ListRow
              icon="settings"
              tone="primary"
              title={t('budgets.home.settings')}
              detail={canEditSettings ? t('budgets.home.settingsDetail') : undefined}
              onPress={() => goTo(`/budgets/${budgetId}/settings`)}
              divider
            />
            <ListRow
              icon="account"
              tone="success"
              title={t('budgets.home.account')}
              detail={t('budgets.home.accountDetail')}
              onPress={() => goTo('/settings')}
              divider
            />
          </UiCard>
        </>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  headerButton: { minWidth: MinTouchTarget, minHeight: MinTouchTarget, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 28, lineHeight: 34, fontFamily: FontFamily.bold, letterSpacing: -0.56 },
  reminder: { gap: Spacing.three },
  reminderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two + Spacing.one },
  reminderText: { flex: 1, fontSize: 14, lineHeight: 20 },
  links: { paddingVertical: Spacing.one, gap: 0 },
});
