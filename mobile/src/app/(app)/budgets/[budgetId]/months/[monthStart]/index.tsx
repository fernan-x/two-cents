import type { Group, LineView, MonthAction, MonthDetail } from '@two-cents/shared/contracts';
import * as Haptics from 'expo-haptics';
import { type Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/auth/api-client';
import { errorMessage } from '@/auth/error-message';
import { Amount } from '@/components/amount';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Card, ListRow, SectionHeader } from '@/components/ui';
import { FontFamily, MinTouchTarget, Spacing } from '@/constants/theme';
import { formatDay } from '@/features/budgets/format';
import { useCan } from '@/features/budgets/use-can';
import { planningApi } from '@/features/planning/api';
import { LineRow } from '@/features/planning/line-row';
import { monthTitle } from '@/features/planning/month-label';
import { PrivateRow } from '@/features/planning/private-row';
import { SummaryHeader } from '@/features/planning/summary-header';
import { useLiveSummary } from '@/features/planning/use-live-summary';
import { useMonth, useMonthMutation } from '@/features/planning/use-month';
import { OfflineBanner } from '@/features/planning/offline-banner';
import { useTheme } from '@/hooks/use-theme';

type Member = MonthDetail['members'][number];

/**
 * One budget month (US1–US5): the live summary on top, pre-filled incomes to confirm, the status
 * actions (validate, close, reopen), incomes, then the lines of each group — the personal lines (DI)
 * of each member with their private sum, recurring shared (DCR) and one-off shared (DCE). Refreshed
 * every 2 s while open (research R4). Read-only for viewers and closed months.
 */
export default function MonthScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const { budgetId, monthStart } = useLocalSearchParams<{ budgetId: string; monthStart: string }>();
  const month = useMonth(budgetId, monthStart);
  const canCreate = useCan(budgetId, 'months.create');
  const [organizing, setOrganizing] = useState(false);
  const summary = useLiveSummary(month.data);

  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const status = useMonthMutation(budgetId, monthStart, (action: MonthAction) =>
    planningApi.changeStatus(budgetId, monthStart, { action }),
  );
  const confirmIncomes = useMonthMutation(budgetId, monthStart, () => planningApi.confirmIncomes(budgetId, monthStart));
  const reorder = useMonthMutation(budgetId, monthStart, (vars: { group: Group; owner?: string; ids: string[] }) =>
    planningApi.reorderLines(budgetId, monthStart, {
      group: vars.group,
      ownerMembershipId: vars.owner,
      lineIds: vars.ids,
    }),
  );

  const notFound = month.error instanceof ApiError && month.error.code === 'MONTH_NOT_FOUND';
  const data = month.data;
  const go = (path: string) => router.push(path as Href);
  const lineHref = (query: string) => `/budgets/${budgetId}/months/${monthStart}/line?${query}`;

  if (!data) {
    return (
      <FormScreen>
        <Stack.Screen options={{ title: t('planning.month.title') }} />
        {month.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
        {notFound ? (
          <Card>
            <ThemedText>{t('planning.month.notFound')}</ThemedText>
            {canCreate ? (
              <Button
                label={t('planning.month.create')}
                onPress={() => go(`/budgets/${budgetId}/months/new?period=${monthStart}`)}
              />
            ) : null}
          </Card>
        ) : (
          <ErrorBanner message={month.error ? errorMessage(t, month.error) : null} />
        )}
      </FormScreen>
    );
  }

  const me = data.members.find((m) => m.isMe);
  const name = (m: Member) => m.displayName ?? t('budgets.anonymousFormerMember');
  const sections: { key: string; title: string; group: Group; owner?: string; lines: LineView[]; canAdd: boolean }[] = [
    ...data.members.map((m) => ({
      key: `personal-${m.membershipId}`,
      title: t('planning.month.personalOf', { name: name(m) }),
      group: 'personal' as const,
      owner: m.membershipId,
      lines: data.lines.filter((l) => l.group === 'personal' && l.ownerMembershipId === m.membershipId),
      canAdd: data.can.editShared && m.isMe,
    })),
    ...(['recurring_shared', 'one_off_shared'] as const).map((group) => ({
      key: group,
      title: t(`planning.groups.${group}`),
      group,
      lines: data.lines.filter((l) => l.group === group),
      canAdd: data.can.editShared,
    })),
  ];
  const sorted = (lines: LineView[]) => [...lines].sort((a, b) => a.position - b.position);
  // Other members' private lines, as one sum in their DI (FR-019).
  const privateOf = (section: { group: Group; owner?: string }) =>
    section.group === 'personal'
      ? data.privateAggregates.find((p) => p.membershipId === section.owner)
      : undefined;

  function move(section: (typeof sections)[number], index: number, delta: -1 | 1) {
    const ids = sorted(section.lines).map((l) => l.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void Haptics.selectionAsync();
    reorder.mutate({ group: section.group, owner: section.owner, ids });
  }

  function changeStatus(action: MonthAction) {
    Alert.alert(t(`planning.month.${action}`), t(`planning.month.${action}Confirm`), [
      { text: t('planning.line.cancel'), style: 'cancel' },
      {
        text: t('planning.month.confirmAction'),
        onPress: () =>
          status.mutate(action, {
            onSuccess: () => {
              setReviewIds([]);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            },
            onError: (e) => {
              if (e instanceof ApiError && e.code === 'LINES_NEED_REVIEW') setReviewIds(e.details.lineIds ?? []);
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            },
          }),
      },
    ]);
  }

  const mustConfirm = !!me && data.flags.incomesToConfirm.includes(me.membershipId) && data.can.editShared;
  const toReview = new Set([...data.flags.linesNeedReview, ...reviewIds]);

  const incomesByMember = data.members.map((m) => ({
    member: m,
    count: data.incomes.filter((i) => i.membershipId === m.membershipId).length,
    counted: summary?.members.find((s) => s.membershipId === m.membershipId)?.countedIncomeMinor ?? '0',
  }));
  const canOrganize = data.can.editShared;

  return (
    <FormScreen>
      <OfflineBanner />
      <Stack.Screen
        options={{
          title: monthTitle(data.month, i18n.language),
          headerRight: canOrganize
            ? () => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(organizing ? 'planning.month.organizeDone' : 'planning.month.organize')}
                  accessibilityState={{ selected: organizing }}
                  hitSlop={8}
                  style={styles.headerButton}
                  onPress={() => setOrganizing((v) => !v)}>
                  <ThemedText type="smallBold" themeColor="primary">
                    {t(organizing ? 'planning.month.organizeDone' : 'planning.month.organize')}
                  </ThemedText>
                </Pressable>
              )
            : undefined,
        }}
      />
      <View style={styles.headerRow}>
        <ThemedText themeColor="textSecondary">
          {t('planning.month.periodLabel', {
            start: formatDay(data.month.start, i18n.language),
            end: formatDay(data.month.end, i18n.language, true),
          })}
        </ThemedText>
        <ThemedText type="smallBold">{t(`planning.status.${data.month.status}`)}</ThemedText>
      </View>
      {!data.can.editShared ? (
        <View style={styles.inline}>
          <Icon name="lock" size={14} themeColor="textSecondary" />
          <ThemedText type="small" themeColor="textSecondary">
            {t('planning.month.readOnly')}
          </ThemedText>
        </View>
      ) : null}

      {summary ? <SummaryHeader members={data.members} summary={summary} currency={data.currency} /> : null}
      <ErrorBanner message={reorder.error ? errorMessage(t, reorder.error) : null} />

      {mustConfirm ? (
        <Card accessibilityLabel={t('planning.month.confirmIncomesBanner')}>
          <View style={styles.inline}>
            <Icon name="info" size={16} themeColor="primary" />
            <ThemedText type="smallBold" style={styles.flex}>
              {t('planning.month.confirmIncomesBanner')}
            </ThemedText>
          </View>
          <Button
            label={t('planning.month.confirmIncomes')}
            loading={confirmIncomes.isPending}
            onPress={() =>
              confirmIncomes.mutate(undefined, {
                onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
              })
            }
          />
          <ErrorBanner message={confirmIncomes.error ? errorMessage(t, confirmIncomes.error) : null} />
        </Card>
      ) : null}

      {toReview.size > 0 ? (
        <View style={styles.inline} accessible>
          <Icon name="alert" size={16} color={theme.warning} />
          <ThemedText type="smallBold" style={styles.flex}>
            {t('planning.month.needsReviewBanner', { count: toReview.size })}
          </ThemedText>
        </View>
      ) : null}

      {data.can.changeStatus.length > 0 ? (
        <View style={styles.section}>
          {data.can.changeStatus.map((action) => (
            <Button
              key={action}
              label={t(`planning.month.${action}`)}
              variant={action === 'activate' ? 'primary' : 'secondary'}
              loading={status.isPending}
              onPress={() => changeStatus(action)}
            />
          ))}
          <ErrorBanner
            message={
              status.error && !(status.error instanceof ApiError && status.error.code === 'LINES_NEED_REVIEW')
                ? errorMessage(t, status.error)
                : null
            }
          />
        </View>
      ) : null}

      <SectionHeader
        title={t('planning.month.incomes')}
        action={me ? t('planning.month.manageIncomes') : undefined}
        onAction={me ? () => go(`/budgets/${budgetId}/months/${monthStart}/income`) : undefined}
      />
      <Card style={styles.list}>
        {incomesByMember.map(({ member, count, counted }, i) => (
          <View
            key={member.membershipId}
            accessible
            style={[styles.incomeRow, i > 0 && [styles.divider, { borderTopColor: theme.border }]]}>
            <View style={styles.flex}>
              <ThemedText style={styles.rowTitle}>{name(member)}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {t('planning.month.incomesDetail', { count })}
              </ThemedText>
            </View>
            <Amount minor={counted} currency={data.currency} style={styles.rowTitle} />
          </View>
        ))}
      </Card>

      {sections.map((section) => {
        const lines = sorted(section.lines);
        return (
          <View key={section.key} style={styles.section}>
            <SectionHeader
              title={section.title}
              action={section.canAdd && !organizing ? t('planning.month.add') : undefined}
              onAction={
                section.canAdd
                  ? () => go(lineHref(`group=${section.group}${section.owner ? `&owner=${section.owner}` : ''}`))
                  : undefined
              }
            />
            <Card style={styles.list}>
              {lines.length === 0 && !privateOf(section) ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {t('planning.month.empty')}
                </ThemedText>
              ) : null}
              {lines.map((line, index) =>
                organizing && line.editable ? (
                  <View key={line.id} style={[styles.organizeRow, index > 0 && [styles.divider, { borderTopColor: theme.border }]]}>
                    <ThemedText style={[styles.flex, styles.rowTitle]} numberOfLines={1}>
                      {line.label}
                    </ThemedText>
                    <MoveButton
                      icon="chevU"
                      label={t('planning.month.moveUp', { label: line.label })}
                      disabled={index === 0 || reorder.isPending}
                      onPress={() => move(section, index, -1)}
                    />
                    <MoveButton
                      icon="chevD"
                      label={t('planning.month.moveDown', { label: line.label })}
                      disabled={index === lines.length - 1 || reorder.isPending}
                      onPress={() => move(section, index, 1)}
                    />
                  </View>
                ) : (
                  <LineRow
                    key={line.id}
                    line={line}
                    members={data.members}
                    currency={data.currency}
                    divider={index > 0}
                    highlight={toReview.has(line.id)}
                    onPress={line.editable ? () => go(lineHref(`lineId=${line.id}`)) : undefined}
                  />
                ),
              )}
              {privateOf(section) ? (
                <PrivateRow aggregate={privateOf(section)!} currency={data.currency} divider={lines.length > 0} />
              ) : null}
            </Card>
          </View>
        );
      })}

      <Card style={styles.list}>
        {/* Spec 004 US2 / 003 FR-037: planned vs actual, also for a Closed month. */}
        <ListRow
          icon="trend"
          tone="primary"
          title={t('tracking.screen.openTracking')}
          onPress={() => go(`/budgets/${budgetId}/months/${monthStart}/tracking`)}
        />
        <ListRow
          divider
          icon="receipt"
          tone="primary"
          title={t('tracking.screen.seeTransactions')}
          onPress={() => go(`/budgets/${budgetId}/months/${monthStart}/transactions`)}
        />
        <ListRow
          divider
          icon="clock"
          tone="info"
          title={t('planning.month.history')}
          onPress={() => go(`/budgets/${budgetId}/months/${monthStart}/history`)}
        />
        {data.can.editShared ? (
          <ListRow
            divider
            icon="copy"
            tone="primary"
            title={t('planning.month.saveTemplate')}
            onPress={() => go(`/budgets/${budgetId}/months/templates?fromMonth=${monthStart}`)}
          />
        ) : null}
        <ListRow
          divider
          icon="calendar"
          tone="primary"
          title={t('planning.month.allMonths')}
          onPress={() => go(`/budgets/${budgetId}/months`)}
        />
        <ListRow
          divider
          icon="sliders"
          tone="info"
          title={t('planning.month.categories')}
          onPress={() => go(`/budgets/${budgetId}/months/categories`)}
        />
      </Card>
    </FormScreen>
  );
}

function MoveButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: 'chevU' | 'chevD';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.move, { opacity: disabled ? 0.3 : pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={20} themeColor="primary" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerButton: { minWidth: MinTouchTarget, minHeight: MinTouchTarget, alignItems: 'center', justifyContent: 'center' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  inline: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  section: { gap: Spacing.two },
  list: { paddingVertical: Spacing.two, gap: 0 },
  incomeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTouchTarget, paddingVertical: Spacing.two },
  organizeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, minHeight: MinTouchTarget },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  flex: { flex: 1 },
  rowTitle: { fontSize: 15, lineHeight: 20, fontFamily: FontFamily.semibold },
  move: { width: MinTouchTarget, height: MinTouchTarget, alignItems: 'center', justifyContent: 'center' },
});
