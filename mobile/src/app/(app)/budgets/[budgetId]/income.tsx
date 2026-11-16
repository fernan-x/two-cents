import { useQueryClient } from '@tanstack/react-query';
import { parseAmount } from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { budgetsApi } from '@/features/budgets/api';
import { formatDay } from '@/features/budgets/format';
import { budgetKeys } from '@/features/budgets/query-keys';
import { useBudget } from '@/features/budgets/use-can';

/**
 * FR-024/FR-025a: this month's income, in exact minor units, after accepting or from the reminder.
 * Everyone in the budget sees it, and the screen says so before anything is typed.
 */
export default function Income() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const data = budget.data;
  const amount = data ? parseAmount(input, data.currency) : null;
  const home = () => router.replace(`/budgets/${budgetId}` as Href);

  async function save() {
    if (!data || amount === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await budgetsApi.putIncome(budgetId, data.currentMonth.start, amount.toString());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries({ queryKey: budgetKeys.detail(budgetId) });
      home();
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) return <FormScreen>{null}</FormScreen>;
  return (
    <FormScreen
      title={t('budgets.income.title')}
      subtitle={t('budgets.income.subtitle', {
        start: formatDay(data.currentMonth.start, i18n.language),
        end: formatDay(data.currentMonth.end, i18n.language),
      })}>
      <ThemedText type="small" accessibilityRole="text">
        ⓘ {t('budgets.income.visibility')}
      </ThemedText>
      <TextField
        label={t('budgets.income.amount', { currency: data.currency })}
        value={input}
        onChangeText={setInput}
        placeholder={t('budgets.income.placeholder')}
        keyboardType="decimal-pad"
        error={input.trim() && amount === null ? t('errors.INVALID_AMOUNT') : null}
        autoFocus
      />
      <ErrorBanner message={error ? errorMessage(t, error) : null} />
      <Button label={t('budgets.income.save')} disabled={amount === null} loading={submitting} onPress={save} />
      <Button label={t('budgets.income.skip')} variant="link" onPress={home} />
    </FormScreen>
  );
}
