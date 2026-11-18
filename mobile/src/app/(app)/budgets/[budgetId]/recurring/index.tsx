import { useQuery } from '@tanstack/react-query';
import { type Href, router, Stack, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ListRow } from '@/components/ui';
import { formatMinor } from '@/features/budgets/format';
import { useBudget, useCan } from '@/features/budgets/use-can';
import { trackingApi } from '@/features/tracking/api';
import { trackingKeys } from '@/features/tracking/query-keys';

/** Recurring expenses (US8): each rule with its next date; paused rules say so. */
export default function RecurringScreen() {
  const { t, i18n } = useTranslation();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId).data;
  const canWrite = useCan(budgetId, 'transactions.write');
  const rules = useQuery({ queryKey: trackingKeys.recurring(budgetId), queryFn: () => trackingApi.recurring(budgetId) });
  const currency = budget?.currency ?? 'EUR';
  const list = rules.data?.rules ?? [];
  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('tracking.recurring.title') }} />
      {rules.isSuccess && list.length === 0 ? <ThemedText themeColor="textSecondary">{t('tracking.recurring.empty')}</ThemedText> : null}
      {list.map((r) => (
        <ListRow
          key={r.id}
          icon="repeat"
          tone={r.active ? 'primary' : 'info'}
          title={`${r.label} · ${formatMinor(r.amountMinor, currency, i18n.language)}`}
          detail={[
            r.lineLabel,
            r.active && r.nextOccurrence
              ? t('tracking.recurring.next', { date: new Date(`${r.nextOccurrence}T12:00:00Z`).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'fr-FR') })
              : t('tracking.recurring.paused'),
          ]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => router.push(`/budgets/${budgetId}/recurring/edit?ruleId=${r.id}` as Href)}
        />
      ))}
      {canWrite ? <Button label={t('tracking.recurring.add')} onPress={() => router.push(`/budgets/${budgetId}/recurring/edit` as Href)} /> : null}
    </FormScreen>
  );
}
