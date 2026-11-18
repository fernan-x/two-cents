import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';

import { errorMessage } from '@/auth/error-message';
import { Amount } from '@/components/amount';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useBudget } from '@/features/budgets/use-can';
import { useMonth } from '@/features/planning/use-month';
import { trackingApi } from '@/features/tracking/api';
import { applyDryRun, canConfirm, type ReviewRow, toRequestRows } from '@/features/tracking/csv/import-model';
import { csvImportStore } from '@/features/tracking/csv/import-store';
import { trackingKeys } from '@/features/tracking/query-keys';
import { StateBadge } from '@/features/tracking/tracking-cards';
import { useTheme } from '@/hooks/use-theme';

type ClosedAction = 'reopen' | 'move_to_current' | 'skip';

/**
 * Step 2 of the CSV import (US9, FR-041–FR-043): every row with its suggested line and a checkbox,
 * possible duplicates unchecked, unreadable rows to skip. Nothing is saved before "Importer".
 */
export default function ImportReviewScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const client = useQueryClient();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId).data;
  const month = useMonth(budgetId, budget?.currentMonth.start ?? '').data;
  const [rows, setRows] = useState<ReviewRow[]>(csvImportStore.review);
  const [closedAction, setClosedAction] = useState<ClosedAction>('skip');
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);
  const account = { kind: csvImportStore.account } as const;

  useEffect(() => {
    const request = toRequestRows(csvImportStore.review);
    if (!request.length) return;
    void trackingApi
      .importTransactions(budgetId, { dryRun: true, account, rows: request })
      .then((result) => setRows((r) => applyDryRun(r, result)))
      .catch(setError);
    // Dry run once, on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetId]);

  const included = rows.filter((r) => r.include);
  const hasClosed = included.some((r) => r.monthStatus === 'closed');
  const toggle = (id: string) => setRows((all) => all.map((r) => (r.rowId === id ? { ...r, include: !r.include } : r)));
  const lineLabel = (id: string | null) => (id ? month?.lines.find((l) => l.id === id)?.label : null) ?? t('tracking.unassigned');

  const confirm = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await trackingApi.importTransactions(budgetId, {
        dryRun: false,
        account,
        ...(hasClosed ? { closedMonthAction: closedAction } : {}),
        rows: toRequestRows(rows),
      });
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void client.invalidateQueries({ queryKey: trackingKeys.all(budgetId) });
      csvImportStore.review = [];
      Alert.alert(t('tracking.import.done', { count: result.created ?? 0 }));
      router.dismissTo(`/budgets/${budgetId}` as never);
    } catch (e) {
      setError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('tracking.import.review') }} />
      {rows.map((r) => (
        <Pressable
          key={r.rowId}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: r.include, disabled: r.error !== null }}
          disabled={r.error !== null}
          onPress={() => toggle(r.rowId)}>
          <Card>
            <View style={styles.row}>
              <View style={styles.flex}>
                <ThemedText numberOfLines={2}>{r.label}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {r.date ?? '—'} · {lineLabel(r.lineId)}
                </ThemedText>
              </View>
              {r.amountMinor ? <Amount minor={r.amountMinor} currency={budget?.currency ?? 'EUR'} type="smallBold" /> : null}
              <Switch value={r.include} onValueChange={() => toggle(r.rowId)} disabled={r.error !== null} accessibilityLabel={r.label} />
            </View>
            <View style={styles.badges}>
              {r.error ? <StateBadge icon="alert" tone="danger" label={t('tracking.import.unreadable')} /> : null}
              {r.alreadyImported ? <StateBadge icon="check" tone="primary" label={t('tracking.import.alreadyImported')} /> : null}
              {!r.alreadyImported && r.duplicateOf ? <StateBadge icon="copy" tone="warning" label={t('tracking.import.duplicate')} /> : null}
              {r.direction === 'credit' ? <StateBadge icon="info" tone="primary" label={t('tracking.import.refundQuestion')} /> : null}
              {r.monthStatus === 'missing' ? <StateBadge icon="alert" tone="warning" label={t('tracking.import.missingMonth')} /> : null}
              {r.monthStatus === 'closed' ? <StateBadge icon="lock" tone="warning" label={t('tracking.closedMonth.title')} /> : null}
            </View>
          </Card>
        </Pressable>
      ))}

      {hasClosed ? (
        <Card>
          <ThemedText>{t('tracking.import.closedMonths')}</ThemedText>
          <View style={styles.badges}>
            {(['skip', 'move_to_current', 'reopen'] as const).map((a) => (
              <Pressable
                key={a}
                accessibilityRole="button"
                accessibilityState={{ selected: closedAction === a }}
                onPress={() => setClosedAction(a)}
                style={[styles.chip, { backgroundColor: closedAction === a ? theme.primary : theme.backgroundElement, borderColor: theme.border }]}>
                <ThemedText type="small" style={{ color: closedAction === a ? theme.onPrimary : theme.text }}>
                  {t(a === 'skip' ? 'tracking.import.skip' : a === 'reopen' ? 'tracking.closedMonth.reopen' : 'tracking.closedMonth.moveToCurrent')}
                </ThemedText>
              </Pressable>
            ))}
          </View>
        </Card>
      ) : null}

      <ErrorBanner message={error ? errorMessage(t, error) : null} />
      <Button label={t('tracking.import.confirm', { count: included.length })} loading={saving} disabled={!canConfirm(rows)} onPress={() => void confirm()} />
      <Button label={t('common.cancel')} variant="secondary" onPress={() => router.back()} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  flex: { flex: 1 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { minHeight: MinTouchTarget, paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: 1, justifyContent: 'center' },
});
