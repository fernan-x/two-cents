import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionSheetIOS, Alert, Platform, StyleSheet, View } from 'react-native';

import { ApiError } from '@/auth/api-client';
import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useBudget } from '@/features/budgets/use-can';
import { planningApi } from '@/features/planning/api';
import { planningKeys } from '@/features/planning/query-keys';
import { useMonth } from '@/features/planning/use-month';
import { newId } from '@/features/tracking/ids';
import { monthStartOf, todayIn } from '@/features/tracking/month-of';
import { type CreateVars, type ReceiptVars, runTrackingMutation } from '@/features/tracking/mutations';
import { QuickAddForm, type QuickAddResult } from '@/features/tracking/quick-add-form';
import { pickReceipt } from '@/features/tracking/receipts';
import { useHints } from '@/features/tracking/use-tracking';

/** Asks camera or library (native action sheet on iOS, alert buttons elsewhere). */
function choosePhotoSource(t: (k: string) => string): Promise<'camera' | 'library' | null> {
  return new Promise((resolve) => {
    const options = [t('tracking.detail.takePhoto'), t('tracking.detail.pickPhoto'), t('common.cancel')];
    if (Platform.OS === 'ios')
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: 2 }, (i) =>
        resolve(i === 0 ? 'camera' : i === 1 ? 'library' : null),
      );
    else
      Alert.alert(t('tracking.quickAdd.photo'), undefined, [
        { text: options[0], onPress: () => resolve('camera') },
        { text: options[1], onPress: () => resolve('library') },
        { text: options[2], style: 'cancel', onPress: () => resolve(null) },
      ]);
  });
}

/**
 * The quick-add sheet (US1, research R12): opened from the "+" anywhere in a budget. Saving never
 * waits for the network: the write is queued (offline-safe, R3) and the sheet closes at once.
 */
export default function QuickAddScreen() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId).data;
  const today = budget ? todayIn(budget.timeZone) : new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const monthStart = budget ? monthStartOf(budget, date) : today;
  const month = useMonth(budgetId, monthStart);
  const hints = useHints(budgetId);
  const [creating, setCreating] = useState(false);

  const missing = month.error instanceof ApiError && month.error.code === 'MONTH_NOT_FOUND';
  const offlineUnknown = !month.data && month.error instanceof ApiError && month.error.code === 'NETWORK';

  const createMonth = async () => {
    setCreating(true);
    try {
      const detail = await planningApi.createMonth(budgetId, { periodStart: monthStart, source: { kind: 'previous' } });
      client.setQueryData(planningKeys.month(budgetId, monthStart), detail);
    } catch {
      Alert.alert(t('tracking.quickAdd.noMonthTitle'));
    } finally {
      setCreating(false);
    }
  };

  const save = ({ body, photos }: QuickAddResult) => {
    if (!budget) return;
    const txnId = newId();
    const start = monthStartOf(budget, body.date);
    void runTrackingMutation<CreateVars>(client, 'create', { budgetId, monthStart: start, txnId, body, currency: budget.currency }).catch(
      () => undefined, // Failures wait in "À résoudre" (FR-016).
    );
    for (const base64 of photos)
      void runTrackingMutation<ReceiptVars>(client, 'receipt', { budgetId, monthStart: start, txnId, receiptId: newId(), base64 }).catch(
        () => undefined,
      );
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  const me = month.data?.members.find((m) => m.isMe);

  return (
    <ThemedView style={styles.fill}>
      <Stack.Screen options={{ title: t('tracking.quickAdd.title') }} />
      {missing ? (
        <View style={styles.notice}>
          <ThemedText type="subtitle">{t('tracking.quickAdd.noMonthTitle')}</ThemedText>
          <ThemedText>{t('tracking.quickAdd.noMonthBody')}</ThemedText>
          <Button label={t('tracking.quickAdd.createMonth')} loading={creating} onPress={() => void createMonth()} />
        </View>
      ) : null}
      {offlineUnknown ? (
        <View style={styles.notice}>
          <ThemedText>{t('tracking.quickAdd.unknownOffline')}</ThemedText>
        </View>
      ) : null}
      {budget && (month.data || offlineUnknown) ? (
        <QuickAddForm
          currency={budget.currency}
          me={me?.membershipId ?? budget.members.find((m) => m.isMe)?.membershipId ?? ''}
          members={(month.data?.members ?? budget.members.filter((m) => m.role !== 'viewer')).map((m) => ({
            membershipId: m.membershipId,
            displayName: m.displayName,
          }))}
          lines={month.data?.lines ?? []}
          hints={hints.data}
          today={today}
          onDateChange={setDate}
          onSave={save}
          onPickPhoto={async () => {
            const source = await choosePhotoSource(t);
            return source ? pickReceipt(source) : null;
          }}
        />
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  notice: { padding: Spacing.three, gap: Spacing.two },
});
