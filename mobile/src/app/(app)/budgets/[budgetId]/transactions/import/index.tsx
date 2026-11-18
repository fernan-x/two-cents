import type { CsvMapping } from '@two-cents/shared/contracts';
import { headerFingerprint, proposeCsvMapping, rowsFromCsv } from '@two-cents/shared/domain';
import { type Href, router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/auth/api-client';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card } from '@/components/ui';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useBudget } from '@/features/budgets/use-can';
import { useMonth } from '@/features/planning/use-month';
import { trackingApi } from '@/features/tracking/api';
import { buildReviewRows } from '@/features/tracking/csv/import-model';
import { csvImportStore } from '@/features/tracking/csv/import-store';
import { pickCsv } from '@/features/tracking/csv/read-csv';
import { newId } from '@/features/tracking/ids';
import { useHints } from '@/features/tracking/use-tracking';
import { useTheme } from '@/hooks/use-theme';

function Choice({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: on ? theme.primary : theme.backgroundElement, borderColor: theme.border }]}>
      <ThemedText type="small" style={{ color: on ? theme.onPrimary : theme.text }} numberOfLines={1}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

type Column = 'dateColumn' | 'amountColumn' | 'debitColumn' | 'creditColumn';

/**
 * Step 1 of the CSV import (US9): which account the statement comes from, the file, and — the first
 * time a bank format is seen — which column is which. The mapping is remembered (FR-040).
 */
export default function ImportScreen() {
  const { t } = useTranslation();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId).data;
  const month = useMonth(budgetId, budget?.currentMonth.start ?? '').data;
  const hints = useHints(budgetId).data;
  const [account, setAccount] = useState<'joint' | 'member'>('joint');
  const [error, setError] = useState<unknown>(null);
  const [mapping, setMapping] = useState<CsvMapping | null>(null);
  const [header, setHeader] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  const review = async (m: CsvMapping) => {
    if (!budget || !month) return;
    const me = month.members.find((x) => x.isMe)?.membershipId ?? '';
    const read = rowsFromCsv(csvImportStore.rows, m, budget.currency);
    csvImportStore.account = account;
    csvImportStore.mapping = m;
    csvImportStore.review = buildReviewRows(read, {
      payerKey: account === 'joint' ? 'joint' : `member:${me}`,
      lines: month.lines,
      hints,
      newId: () => newId(),
    });
    router.push(`/budgets/${budgetId}/transactions/import/review` as Href);
  };

  const pick = async () => {
    setError(null);
    setBusy(true);
    try {
      const file = await pickCsv();
      if (!file) return;
      csvImportStore.rows = file.rows;
      const proposed = proposeCsvMapping(file.rows, file.delimiter, file.encoding);
      const head = file.rows[proposed?.skipRows ?? 0] ?? [];
      const fingerprint = headerFingerprint(head);
      try {
        const stored = await trackingApi.csvMapping(budgetId, fingerprint);
        return await review(stored);
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'NOT_FOUND')) throw e;
      }
      setHeader(head);
      setMapping(
        proposed ?? {
          delimiter: file.delimiter,
          encoding: file.encoding,
          dateColumn: 0,
          dateFormat: 'DD/MM/YYYY',
          labelColumns: [Math.min(1, head.length - 1)],
          amountColumn: Math.min(2, head.length - 1),
          debitColumn: null,
          creditColumn: null,
          skipRows: 0,
        },
      );
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError('INTERNAL', 0));
    } finally {
      setBusy(false);
    }
  };

  const confirmMapping = async () => {
    if (!mapping || !header) return;
    try {
      await trackingApi.saveCsvMapping(budgetId, headerFingerprint(header), mapping);
      await review(mapping);
    } catch (e) {
      setError(e);
    }
  };

  const columnRow = (title: string, key: Column | 'labelColumns', optional: boolean) => (
    <View style={styles.block}>
      <ThemedText type="smallBold">{title}</ThemedText>
      <View style={styles.row}>
        {optional ? (
          <Choice label="—" on={mapping?.[key as Column] === null} onPress={() => setMapping((m) => m && { ...m, [key]: null })} />
        ) : null}
        {header!.map((h, i) => (
          <Choice
            key={i}
            label={h || `#${i + 1}`}
            on={key === 'labelColumns' ? mapping?.labelColumns[0] === i : mapping?.[key] === i}
            onPress={() => setMapping((m) => m && (key === 'labelColumns' ? { ...m, labelColumns: [i] } : { ...m, [key]: i }))}
          />
        ))}
      </View>
    </View>
  );

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('tracking.import.title') }} />
      <ThemedText type="smallBold">{t('tracking.import.account')}</ThemedText>
      <View style={styles.row}>
        <Choice label={t('tracking.import.jointAccount')} on={account === 'joint'} onPress={() => setAccount('joint')} />
        <Choice label={t('tracking.import.myAccount')} on={account === 'member'} onPress={() => setAccount('member')} />
      </View>
      <Button label={t('tracking.import.pick')} loading={busy} onPress={() => void pick()} />
      <ErrorBanner message={error ? (error instanceof ApiError && error.code === 'INTERNAL' ? t('tracking.import.unreadableFile') : errorMessage(t, error)) : null} />
      {mapping && header ? (
        <Card>
          <ThemedText type="subtitle">{t('tracking.import.mapping')}</ThemedText>
          {columnRow(t('tracking.import.dateColumn'), 'dateColumn', false)}
          <View style={styles.row}>
            <Choice label="JJ/MM/AAAA" on={mapping.dateFormat === 'DD/MM/YYYY'} onPress={() => setMapping({ ...mapping, dateFormat: 'DD/MM/YYYY' })} />
            <Choice label="AAAA-MM-JJ" on={mapping.dateFormat === 'YYYY-MM-DD'} onPress={() => setMapping({ ...mapping, dateFormat: 'YYYY-MM-DD' })} />
          </View>
          {columnRow(t('tracking.import.labelColumn'), 'labelColumns', false)}
          {columnRow(t('tracking.import.amountColumn'), 'amountColumn', true)}
          {columnRow(t('tracking.import.debitColumn'), 'debitColumn', true)}
          {columnRow(t('tracking.import.creditColumn'), 'creditColumn', true)}
          <Button
            label={t('common.continue')}
            disabled={mapping.amountColumn === null && mapping.debitColumn === null && mapping.creditColumn === null}
            onPress={() => void confirmMapping()}
          />
        </Card>
      ) : null}
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  block: { gap: Spacing.two },
  chip: { minHeight: MinTouchTarget, maxWidth: 220, paddingHorizontal: Spacing.three, borderRadius: Radius.full, borderWidth: 1, justifyContent: 'center' },
});
