import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { BudgetDetail } from '@two-cents/shared/contracts';
import * as Haptics from 'expo-haptics';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { budgetsApi } from '@/features/budgets/api';
import { DayStepper } from '@/features/budgets/components';
import { formatDay } from '@/features/budgets/format';
import { budgetKeys } from '@/features/budgets/query-keys';
import { useBudget, useCan } from '@/features/budgets/use-can';

/** US6: name, month start day (from next month, FR-005), currency (until amounts exist, FR-006). */
export default function BudgetSettings() {
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId);
  if (!budget.data) return <FormScreen>{null}</FormScreen>;
  return <SettingsForm budget={budget.data} />;
}

export function SettingsForm({ budget }: { budget: BudgetDetail }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canEdit = useCan(budget.id, 'budget.settings.edit');
  const canDelete = useCan(budget.id, 'budget.delete');
  const [name, setName] = useState(budget.name);
  const [startDay, setStartDay] = useState(budget.pendingMonthStartDay?.startDay ?? budget.monthStartDay);
  const [currency, setCurrency] = useState(budget.currency);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      budgetsApi.update(budget.id, {
        ...(name.trim() !== budget.name ? { name: name.trim() } : {}),
        ...(startDay !== (budget.pendingMonthStartDay?.startDay ?? budget.monthStartDay) ? { monthStartDay: startDay } : {}),
        ...(currency !== budget.currency ? { currency } : {}),
      }),
    onSuccess: async (detail) => {
      queryClient.setQueryData(budgetKeys.detail(budget.id), detail);
      await queryClient.invalidateQueries({ queryKey: budgetKeys.mine });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSaved(true);
    },
  });

  const dirty =
    name.trim() !== budget.name ||
    startDay !== (budget.pendingMonthStartDay?.startDay ?? budget.monthStartDay) ||
    currency !== budget.currency;
  const pending = budget.pendingMonthStartDay;

  return (
    <FormScreen>
      {!canEdit ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('budgets.settings.readOnly')}
        </ThemedText>
      ) : null}
      <TextField
        label={t('budgets.settings.name')}
        value={name}
        onChangeText={(v) => {
          setName(v);
          setSaved(false);
        }}
        editable={canEdit}
        maxLength={60}
      />
      <DayStepper
        label={t('budgets.settings.startDay')}
        value={startDay}
        disabled={!canEdit}
        onChange={(d) => {
          setStartDay(d);
          setSaved(false);
        }}
      />
      {pending ? (
        <ThemedText type="small" accessibilityLiveRegion="polite">
          {t('budgets.settings.pendingStartDay', {
            day: pending.startDay,
            date: formatDay(pending.effectiveFrom, i18n.language, true),
          })}
        </ThemedText>
      ) : null}
      <TextField
        label={t('budgets.settings.currency')}
        value={currency}
        onChangeText={(v) => {
          setCurrency(v.toUpperCase());
          setSaved(false);
        }}
        editable={canEdit && !budget.currencyLocked}
        autoCapitalize="characters"
        maxLength={3}
        hint={budget.currencyLocked ? t('budgets.settings.currencyLocked') : undefined}
      />
      <ErrorBanner message={save.error ? errorMessage(t, save.error) : null} />
      {saved ? <ThemedText accessibilityLiveRegion="polite">✓ {t('budgets.settings.saved')}</ThemedText> : null}
      {canEdit ? (
        <Button
          label={t('budgets.settings.save')}
          disabled={!dirty || !name.trim() || !/^[A-Z]{3}$/.test(currency)}
          loading={save.isPending}
          onPress={() => save.mutate()}
        />
      ) : null}
      {canDelete ? (
        <Button
          label={t('budgets.settings.delete')}
          variant="link"
          onPress={() => router.push(`/budgets/${budget.id}/settings/delete` as Href)}
        />
      ) : null}
    </FormScreen>
  );
}
