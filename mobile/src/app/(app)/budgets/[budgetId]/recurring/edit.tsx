import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentMethod, RecurringRuleView } from '@two-cents/shared/contracts';
import { type Payer, validatePayment } from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { errorMessage } from '@/auth/error-message';
import { Button, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useBudget } from '@/features/budgets/use-can';
import { AmountField, readAmount } from '@/features/planning/amount-field';
import { useMonth } from '@/features/planning/use-month';
import { trackingApi } from '@/features/tracking/api';
import { trackingKeys } from '@/features/tracking/query-keys';
import { useTheme } from '@/hooks/use-theme';

const METHODS: PaymentMethod[] = ['personal_card', 'joint_card', 'meal_voucher', 'cash', 'transfer'];
const allowed = (payer: Payer, m: PaymentMethod) => {
  try {
    validatePayment(payer, m);
    return true;
  } catch {
    return false;
  }
};

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? theme.primary : theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="small" style={{ color: on ? theme.onPrimary : theme.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/** Create or edit a recurring expense (US8, FR-035): changes only affect future occurrences. */
export default function RecurringEditScreen() {
  const { budgetId, ruleId } = useLocalSearchParams<{ budgetId: string; ruleId?: string }>();
  const budget = useBudget(budgetId).data;
  const month = useMonth(budgetId, budget?.currentMonth.start ?? '').data;
  const rules = useQuery({ queryKey: trackingKeys.recurring(budgetId), queryFn: () => trackingApi.recurring(budgetId) });
  const rule = rules.data?.rules.find((r) => r.id === ruleId);
  if (!budget || !month || (ruleId && !rule)) return <FormScreen>{null}</FormScreen>;
  return <Editor key={rule?.version ?? 'new'} budgetId={budgetId} budget={budget} month={month} rule={rule} />;
}

function Editor({
  budgetId,
  budget,
  month,
  rule,
}: {
  budgetId: string;
  budget: NonNullable<ReturnType<typeof useBudget>['data']>;
  month: NonNullable<ReturnType<typeof useMonth>['data']>;
  rule: RecurringRuleView | undefined;
}) {
    const { t } = useTranslation();
    const client = useQueryClient();
    const me = month!.members.find((m) => m.isMe)?.membershipId ?? '';
    const [label, setLabel] = useState(rule?.label ?? '');
    const [amount, setAmount] = useState(rule ? `${rule.amountMinor.slice(0, -2) || '0'},${rule.amountMinor.slice(-2).padStart(2, '0')}` : '');
    const [day, setDay] = useState(rule?.dayOfMonth ?? 5);
    const [payer, setPayer] = useState<Payer>(rule?.payer ?? { kind: 'joint' });
    const [method, setMethod] = useState<PaymentMethod>(rule?.paymentMethod ?? 'transfer');
    const [seriesId, setSeriesId] = useState<string | null>(rule?.seriesId ?? null);
    const [active, setActive] = useState(rule?.active ?? true);
    const [saving, setSaving] = useState(false);
    const minor = readAmount(amount, budget!.currency).minor;
    const lines = month!.lines.filter((l) => (l.group === 'recurring_shared' || (l.group === 'personal' && l.ownerMembershipId === me)));
    const effectiveMethod = allowed(payer, method) ? method : payer.kind === 'joint' ? 'transfer' : 'personal_card';

    const done = () => {
      void client.invalidateQueries({ queryKey: trackingKeys.recurring(budgetId) });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    };
    const save = async () => {
      if (!minor) return;
      setSaving(true);
      try {
        if (rule)
          await trackingApi.patchRecurring(budgetId, rule.id, {
            expectedVersion: rule.version,
            label,
            amountMinor: minor,
            dayOfMonth: day,
            payer,
            paymentMethod: effectiveMethod,
            seriesId,
            active,
          });
        else
          await trackingApi.createRecurring(budgetId, {
            label,
            amountMinor: minor,
            dayOfMonth: day,
            payer,
            paymentMethod: effectiveMethod,
            seriesId,
            startsOn: budget!.currentMonth.start,
          });
        done();
      } catch (e) {
        Alert.alert(errorMessage(t, e));
      } finally {
        setSaving(false);
      }
    };
    const remove = () =>
      rule &&
      Alert.alert(t('tracking.recurring.delete'), undefined, [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('tracking.recurring.delete'),
          style: 'destructive',
          onPress: () => void trackingApi.deleteRecurring(budgetId, rule.id, rule.version).then(done).catch((e: unknown) => Alert.alert(errorMessage(t, e))),
        },
      ]);

    return (
      <FormScreen>
        <Stack.Screen options={{ title: t('tracking.recurring.edit') }} />
        <TextField label={t('tracking.quickAdd.label')} value={label} onChangeText={setLabel} maxLength={60} />
        <AmountField label={t('tracking.quickAdd.amount')} currency={budget!.currency} value={amount} onChange={setAmount} />
        <ThemedText type="smallBold">{t('tracking.recurring.day')}</ThemedText>
        <View style={styles.row}>
          <Choice label="−" on={false} onPress={() => setDay(Math.max(1, day - 1))} />
          <ThemedText accessibilityLiveRegion="polite" style={styles.day}>
            {day}
          </ThemedText>
          <Choice label="+" on={false} onPress={() => setDay(Math.min(31, day + 1))} />
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {t('tracking.recurring.dayHint')}
        </ThemedText>
        <ThemedText type="smallBold">{t('tracking.quickAdd.payer')}</ThemedText>
        <View style={styles.row}>
          <Choice label={t('tracking.jointAccount')} on={payer.kind === 'joint'} onPress={() => setPayer({ kind: 'joint' })} />
          {month!.members.map((m) => (
            <Choice
              key={m.membershipId}
              label={m.displayName ?? ''}
              on={payer.kind === 'member' && payer.membershipId === m.membershipId}
              onPress={() => setPayer({ kind: 'member', membershipId: m.membershipId })}
            />
          ))}
        </View>
        <ThemedText type="smallBold">{t('tracking.quickAdd.method')}</ThemedText>
        <View style={styles.row}>
          {METHODS.filter((m) => allowed(payer, m)).map((m) => (
            <Choice key={m} label={t(`tracking.methods.${m}`)} on={effectiveMethod === m} onPress={() => setMethod(m)} />
          ))}
        </View>
        <ThemedText type="smallBold">{t('tracking.recurring.line')}</ThemedText>
        <View style={styles.row}>
          <Choice label={t('tracking.quickAdd.noLine')} on={seriesId === null} onPress={() => setSeriesId(null)} />
          {lines.map((l) => (
            <Choice key={l.id} label={l.label} on={seriesId === l.seriesId} onPress={() => setSeriesId(l.seriesId)} />
          ))}
        </View>
        {rule ? (
          <View style={styles.switchRow}>
            <ThemedText>{active ? t('tracking.recurring.active') : t('tracking.recurring.paused')}</ThemedText>
            <Switch accessibilityLabel={t('tracking.recurring.active')} value={active} onValueChange={setActive} />
          </View>
        ) : null}
        <Button label={t('tracking.recurring.save')} loading={saving} disabled={!minor || !label.trim()} onPress={() => void save()} />
        {rule ? <Button label={t('tracking.recurring.delete')} variant="danger" onPress={remove} /> : null}
      </FormScreen>
    );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, alignItems: 'center' },
  chip: { minHeight: MinTouchTarget, minWidth: MinTouchTarget, paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  day: { minWidth: 48, textAlign: 'center', fontSize: 20 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: MinTouchTarget },
});
