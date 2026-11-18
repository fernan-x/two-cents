import { type Href, router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card, ListRow } from '@/components/ui';
import { FontFamily, MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { formatMinor } from '@/features/budgets/format';
import { useMonth } from '@/features/planning/use-month';
import { byDay, filterTransactions, type TransactionFilters } from '@/features/tracking/transaction-filters';
import { TransactionRow } from '@/features/tracking/transaction-row';
import { SyncBanner } from '@/features/tracking/sync-banner';
import { UndoBar } from '@/features/tracking/undo-bar';
import { useMonthTransactions } from '@/features/tracking/use-tracking';
import { useTheme } from '@/hooks/use-theme';

function Toggle({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.toggle, { backgroundColor: on ? theme.primary : theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="small" style={{ color: on ? theme.onPrimary : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** The month's transactions (US5, FR-017): newest first by day, filters and label search on the device. */
export default function TransactionsScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { budgetId, monthStart } = useLocalSearchParams<{ budgetId: string; monthStart: string }>();
  const list = useMonthTransactions(budgetId, monthStart);
  const month = useMonth(budgetId, monthStart).data;
  const [f, setF] = useState<TransactionFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const result = useMemo(
    () => filterTransactions(list.data?.transactions ?? [], month?.lines ?? [], f),
    [list.data, month, f],
  );
  if (!month) return <FormScreen>{null}</FormScreen>;
  const set = (patch: TransactionFilters) => setF((old) => ({ ...old, ...patch }));
  const toggle = <K extends keyof TransactionFilters>(key: K, value: TransactionFilters[K]) =>
    set({ [key]: f[key] === value ? null : value } as TransactionFilters);

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('tracking.list.title') }} />
      <TextInput
        accessibilityLabel={t('tracking.list.search')}
        placeholder={t('tracking.list.search')}
        placeholderTextColor={theme.textSecondary}
        value={f.search ?? ''}
        onChangeText={(search) => set({ search })}
        style={[styles.search, { color: theme.text, borderColor: theme.border, backgroundColor: theme.backgroundElement }]}
      />
      <Toggle label={t('tracking.list.filters')} on={showFilters} onPress={() => setShowFilters(!showFilters)} />
      {showFilters ? (
        <Card>
          <ThemedText type="smallBold">{t('tracking.list.payer')}</ThemedText>
          <View style={styles.wrap}>
            <Toggle label={t('tracking.jointAccount')} on={f.payer === 'joint'} onPress={() => toggle('payer', 'joint')} />
            {month.members.map((m) => (
              <Toggle key={m.membershipId} label={m.displayName ?? ''} on={f.payer === m.membershipId} onPress={() => toggle('payer', m.membershipId)} />
            ))}
          </View>
          <ThemedText type="smallBold">{t('tracking.list.member')}</ThemedText>
          <View style={styles.wrap}>
            {month.members.map((m) => (
              <Toggle key={m.membershipId} label={m.displayName ?? ''} on={f.member === m.membershipId} onPress={() => toggle('member', m.membershipId)} />
            ))}
          </View>
          <ThemedText type="smallBold">{t('tracking.list.group')}</ThemedText>
          <View style={styles.wrap}>
            {(['personal', 'recurring_shared', 'one_off_shared'] as const).map((g) => (
              <Toggle key={g} label={t(`tracking.screen.groups.${g}`)} on={f.group === g} onPress={() => toggle('group', g)} />
            ))}
            <Toggle label={t('tracking.unassigned')} on={f.group === 'unassigned'} onPress={() => toggle('group', 'unassigned')} />
          </View>
          <ThemedText type="smallBold">{t('tracking.list.line')}</ThemedText>
          <View style={styles.wrap}>
            {month.lines.map((l) => (
              <Toggle key={l.id} label={l.label} on={f.lineId === l.id} onPress={() => toggle('lineId', l.id)} />
            ))}
          </View>
          <ThemedText type="smallBold">{t('tracking.list.kind')}</ThemedText>
          <View style={styles.wrap}>
            <Toggle label={t('tracking.planned')} on={f.planned === true} onPress={() => toggle('planned', true)} />
            <Toggle label={t('tracking.unplanned')} on={f.planned === false} onPress={() => toggle('planned', false)} />
            <Toggle label={t('tracking.list.pendingOnly')} on={!!f.pendingOnly} onPress={() => set({ pendingOnly: !f.pendingOnly })} />
          </View>
          <Toggle label={t('tracking.list.clear')} on={false} onPress={() => setF({})} />
        </Card>
      ) : null}

      <SyncBanner budgetId={budgetId} />
      <UndoBar />
      <ThemedText style={styles.total} accessibilityRole="summary">
        {t('tracking.list.total', { amount: formatMinor(result.totalMinor, month.currency, i18n.language) })}
      </ThemedText>
      {result.rows.length === 0 ? <ThemedText themeColor="textSecondary">{t('tracking.list.empty')}</ThemedText> : null}
      {byDay(result.rows).map((day) => (
        <Card key={day.date}>
          <ThemedText type="smallBold" accessibilityRole="header">
            {new Date(`${day.date}T12:00:00Z`).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </ThemedText>
          {day.rows.map((r) => (
            <TransactionRow
              key={r.id}
              row={r}
              lines={month.lines}
              members={month.members}
              onPress={r.private ? undefined : () => router.push(`/budgets/${budgetId}/transactions/${r.id}?monthStart=${monthStart}` as Href)}
            />
          ))}
        </Card>
      ))}
      <ListRow icon="doc" title={t('tracking.import.title')} onPress={() => router.push(`/budgets/${budgetId}/transactions/import` as Href)} />
      <ListRow icon="repeat" title={t('tracking.recurring.title')} onPress={() => router.push(`/budgets/${budgetId}/recurring` as Href)} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  search: { minHeight: MinTouchTarget, borderWidth: 1, borderRadius: Radius.sm, paddingHorizontal: Spacing.three, fontFamily: FontFamily.regular, fontSize: 17 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  toggle: { minHeight: MinTouchTarget, paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: 1, justifyContent: 'center', alignSelf: 'flex-start' },
  total: { fontFamily: FontFamily.semibold },
});
