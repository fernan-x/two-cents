import { useQueryClient } from '@tanstack/react-query';
import type { FullTransactionView, TransactionPatch } from '@two-cents/shared/contracts';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { errorMessage } from '@/auth/error-message';
import { tokenStore } from '@/auth/token-store';
import { config } from '@/config';
import { Button, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card, SectionHeader } from '@/components/ui';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { formatMinor } from '@/features/budgets/format';
import { AmountField, readAmount } from '@/features/planning/amount-field';
import { askConflict, staleCurrent } from '@/features/planning/conflict-dialog';
import { useMonth } from '@/features/planning/use-month';
import { trackingApi } from '@/features/tracking/api';
import { newId } from '@/features/tracking/ids';
import { type PatchVars, type ReceiptVars, runTrackingMutation } from '@/features/tracking/mutations';
import { pickReceipt } from '@/features/tracking/receipts';
import { scheduleDelete } from '@/features/tracking/undo-delete';
import { useMonthTransactions } from '@/features/tracking/use-tracking';
import { useTheme } from '@/hooks/use-theme';

const toInput = (minor: string, language: string) => {
  const abs = minor.replace(/^-/, '').padStart(3, '0');
  return `${abs.slice(0, -2)}${language === 'en' ? '.' : ','}${abs.slice(-2)}`;
};

interface PartDraft {
  lineId: string | null;
  text: string;
}

/**
 * One transaction (US5): edit any field, split it across lines, attach receipt photos, delete it
 * with 10 s to undo. Edits are queued like creations, so they work offline (research R3).
 */
export default function TransactionScreen() {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const client = useQueryClient();
  const { budgetId, txnId, monthStart } = useLocalSearchParams<{ budgetId: string; txnId: string; monthStart: string }>();
  const list = useMonthTransactions(budgetId, monthStart);
  const month = useMonth(budgetId, monthStart).data;
  const row = list.data?.transactions.find((r) => r.id === txnId);
  if (!row || row.private || !month) return <FormScreen>{null}</FormScreen>;
  return <Editor key={row.version} txn={row} lines={month.lines} budgetId={budgetId} monthStart={monthStart} theme={theme} t={t} language={i18n.language} client={client} />;
}

function Editor({
  txn,
  lines,
  budgetId,
  monthStart,
  theme,
  t,
  language,
  client,
}: {
  txn: FullTransactionView;
  lines: NonNullable<ReturnType<typeof useMonth>['data']>['lines'];
  budgetId: string;
  monthStart: string;
  theme: ReturnType<typeof useTheme>;
  t: ReturnType<typeof useTranslation>['t'];
  language: string;
  client: ReturnType<typeof useQueryClient>;
}) {
  const [label, setLabel] = useState(txn.label);
  const [amountText, setAmountText] = useState(toInput(txn.amountMinor, language));
  const [refund, setRefund] = useState(txn.isRefund);
  const [note, setNote] = useState(txn.note ?? '');
  const [planned, setPlanned] = useState(txn.isPlanned);
  const [parts, setParts] = useState<PartDraft[]>(
    txn.parts.map((p) => ({ lineId: p.lineId, text: toInput(p.amountMinor, language) })),
  );
  const [saving, setSaving] = useState(false);
  const editable = txn.can.edit;
  const amount = readAmount(amountText, txn.currency).minor;
  const signed = (m: string | null) => (m === null ? null : refund ? `-${m}` : m);
  const partMinors = parts.map((p) => readAmount(p.text, txn.currency).minor);
  const split = parts.length > 1;
  const difference =
    split && amount !== null && partMinors.every((m) => m !== null)
      ? BigInt(amount) - partMinors.reduce((s, m) => s + BigInt(m!), 0n)
      : 0n;
  const usable = lines.filter((l) => l.group !== 'personal' || l.editable);

  const save = async (expectedVersion = txn.version) => {
    const total = signed(amount);
    if (!total) return;
    const body: TransactionPatch = {
      expectedVersion,
      label,
      amountMinor: total,
      note: note.trim() ? note.trim() : null,
      isPlanned: planned,
      parts: parts
        .filter((p) => p.lineId !== null || split)
        .map((p, i) => ({ lineId: p.lineId, amountMinor: split ? signed(partMinors[i])! : total })),
    };
    setSaving(true);
    try {
      await runTrackingMutation<PatchVars>(client, 'patch', { budgetId, monthStart, txnId: txn.id, body });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch (e) {
      const current = staleCurrent<FullTransactionView>(e);
      if (current) {
        const choice = await askConflict(t, {
          theirs: `${current.label} ${formatMinor(current.amountMinor, current.currency, language)}`,
          mine: `${label} ${formatMinor(total, txn.currency, language)}`,
        });
        if (choice === 'mine') return save(current.version);
        router.back();
      } else Alert.alert(errorMessage(t, e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () =>
    Alert.alert(t('tracking.detail.deleteConfirm'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('tracking.detail.delete'),
        style: 'destructive',
        onPress: () => {
          scheduleDelete(client, { budgetId, monthStart, txnId: txn.id, expectedVersion: txn.version });
          router.back();
        },
      },
    ]);

  const addPhoto = async (source: 'camera' | 'library') => {
    const base64 = await pickReceipt(source);
    if (!base64) return;
    void runTrackingMutation<ReceiptVars>(client, 'receipt', { budgetId, monthStart, txnId: txn.id, receiptId: newId(), base64 }).catch(
      (e: unknown) => Alert.alert(errorMessage(t, e)),
    );
  };

  return (
    <FormScreen>
      <Stack.Screen options={{ title: txn.label }} />
      {!editable ? <ThemedText themeColor="textSecondary">{t('tracking.detail.readOnly')}</ThemedText> : null}
      <TextField label={t('tracking.quickAdd.label')} value={label} onChangeText={setLabel} editable={editable} maxLength={60} />
      <AmountField label={t('tracking.quickAdd.amount')} currency={txn.currency} value={amountText} editable={editable} onChange={(text) => setAmountText(text)} />
      <View style={styles.switchRow}>
        <ThemedText>{t('tracking.refund')}</ThemedText>
        <Switch accessibilityLabel={t('tracking.refund')} value={refund} onValueChange={setRefund} disabled={!editable} />
      </View>
      <View style={styles.switchRow}>
        <ThemedText>{planned ? t('tracking.planned') : t('tracking.unplanned')}</ThemedText>
        <Switch accessibilityLabel={t('tracking.planned')} value={planned} onValueChange={setPlanned} disabled={!editable} />
      </View>

      <SectionHeader title={split ? t('tracking.detail.split') : t('tracking.quickAdd.line')} />
      <Card>
        {(parts.length ? parts : [{ lineId: null, text: amountText }]).map((p, i) => (
          <View key={i} style={styles.part}>
            <View style={styles.chips}>
              {[null, ...usable.map((l) => l.id)].map((id) => {
                const on = p.lineId === id;
                return (
                  <Pressable
                    key={id ?? 'none'}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    disabled={!editable}
                    onPress={() =>
                      setParts((all) => {
                        const next = all.length ? [...all] : [{ lineId: null, text: amountText }];
                        next[i] = { ...next[i], lineId: id };
                        return next;
                      })
                    }
                    style={[styles.chip, { backgroundColor: on ? theme.primary : theme.backgroundElement, borderColor: theme.border }]}>
                    <ThemedText type="small" style={{ color: on ? theme.onPrimary : theme.text }}>
                      {id ? lines.find((l) => l.id === id)?.label : t('tracking.quickAdd.noLine')}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            {split ? (
              <AmountField
                label={t('tracking.quickAdd.amount')}
                currency={txn.currency}
                value={p.text}
                editable={editable}
                onChange={(text) => setParts((all) => all.map((x, k) => (k === i ? { ...x, text } : x)))}
              />
            ) : null}
          </View>
        ))}
        {editable ? (
          <Button
            label={t('tracking.detail.addPart')}
            variant="secondary"
            onPress={() => setParts((all) => [...(all.length ? all : [{ lineId: null, text: amountText }]), { lineId: null, text: '' }])}
          />
        ) : null}
        {split && difference !== 0n ? (
          <ThemedText themeColor="danger" accessibilityLiveRegion="polite">
            {t('tracking.detail.difference', { amount: formatMinor(difference.toString(), txn.currency, language) })}
          </ThemedText>
        ) : null}
      </Card>

      <TextField label={t('tracking.quickAdd.note')} value={note} onChangeText={setNote} editable={editable} multiline maxLength={500} />

      <SectionHeader title={t('tracking.detail.receipts')} />
      <View style={styles.receipts}>
        {txn.receipts.map((r) => (
          <Image
            key={r.id}
            accessibilityLabel={t('tracking.quickAdd.photo')}
            source={{ uri: `${config.apiUrl}${trackingApi.receiptPath(budgetId, txn.id, r.id)}`, headers: { Authorization: `Bearer ${tokenStore.get() ?? ''}` } }}
            style={styles.receipt}
            contentFit="cover"
          />
        ))}
      </View>
      {editable && txn.receipts.length < 3 ? (
        <View style={styles.row}>
          <Button label={t('tracking.detail.takePhoto')} variant="secondary" onPress={() => void addPhoto('camera')} />
          <Button label={t('tracking.detail.pickPhoto')} variant="secondary" onPress={() => void addPhoto('library')} />
        </View>
      ) : null}

      {editable ? (
        <>
          <Button label={t('tracking.quickAdd.save')} loading={saving} disabled={!amount || !label.trim() || difference !== 0n} onPress={() => void save()} />
          <Button label={t('tracking.detail.delete')} variant="danger" onPress={remove} />
        </>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: MinTouchTarget },
  part: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { minHeight: MinTouchTarget, paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: 1, justifyContent: 'center' },
  receipts: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
  receipt: { width: 96, height: 128, borderRadius: Radius.sm },
  row: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap' },
});
