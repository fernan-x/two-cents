import { type Href, router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Card, SectionHeader } from '@/components/ui';
import { formatMinor } from '@/features/budgets/format';
import { EnvelopeCard } from '@/features/tracking/tracking-cards';
import { TransactionRow } from '@/features/tracking/transaction-row';
import { useMonthTransactions, useTracking } from '@/features/tracking/use-tracking';

/** One envelope (US2): progress, sub-items, and its transactions newest first. */
export default function EnvelopeScreen() {
  const { t, i18n } = useTranslation();
  const { budgetId, monthStart, lineId } = useLocalSearchParams<{ budgetId: string; monthStart: string; lineId: string }>();
  const { data, month } = useTracking(budgetId, monthStart);
  const list = useMonthTransactions(budgetId, monthStart);
  const line = data?.lines.find((l) => l.lineId === lineId);
  const planLine = month?.lines.find((l) => l.id === lineId);
  if (!data || !month || !line || !planLine) return <FormScreen>{null}</FormScreen>;
  const rows = (list.data?.transactions ?? []).filter((r) => !r.private && r.parts.some((p) => p.lineId === lineId));
  return (
    <FormScreen>
      <Stack.Screen options={{ title: planLine.label }} />
      {line.envelope ? <EnvelopeCard label={planLine.label} line={line} currency={month.currency} /> : null}
      {line.envelope?.subItems.length ? (
        <Card>
          {line.envelope.subItems.map((s) => (
            <ThemedText key={s.subItemId}>
              {planLine.subItems.find((x) => x.id === s.subItemId)?.label} · {formatMinor(s.spent, month.currency, i18n.language)}
              {s.remaining !== null ? ` · ${t('tracking.screen.remaining', { amount: formatMinor(s.remaining, month.currency, i18n.language) })}` : ''}
            </ThemedText>
          ))}
        </Card>
      ) : null}
      <SectionHeader title={t('tracking.list.title')} />
      <Card>
        {rows.length === 0 ? <ThemedText themeColor="textSecondary">{t('tracking.list.empty')}</ThemedText> : null}
        {rows.map((r) => (
          <TransactionRow
            key={r.id}
            row={r}
            lines={month.lines}
            members={month.members}
            onPress={() => router.push(`/budgets/${budgetId}/transactions/${r.id}?monthStart=${monthStart}` as Href)}
          />
        ))}
      </Card>
    </FormScreen>
  );
}
