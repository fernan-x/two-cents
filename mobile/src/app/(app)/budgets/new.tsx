import { useQueryClient } from '@tanstack/react-query';
import { budgetMonthFor, localDateIn } from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { getCalendars } from 'expo-localization';
import { type Href, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { accountApi } from '@/auth/account-api';
import { useAuth } from '@/auth/auth-store';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { budgetsApi } from '@/features/budgets/api';
import { DayStepper } from '@/features/budgets/components';
import { formatDay } from '@/features/budgets/format';
import { budgetKeys } from '@/features/budgets/query-keys';
import { registerForPush } from '@/notifications/push-registration';

const deviceTimeZone = () => getCalendars()[0]?.timeZone ?? 'Europe/Paris';

/** US1: name, currency (the profile's by default), month start day (1st by default). SC-004: < 30 s. */
export default function NewBudget() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(auth.me?.currency ?? 'EUR');
  const [startDay, setStartDay] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const timeZone = deviceTimeZone();
  const month = budgetMonthFor(localDateIn(new Date(), timeZone), [{ effectiveFrom: '2000-01-01', startDay }]);
  const trimmed = name.trim();
  const currencyOk = /^[A-Z]{3}$/.test(currency);
  const canSubmit = trimmed.length > 0 && [...trimmed].length <= 60 && currencyOk && !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const budget = await budgetsApi.create({ name: trimmed, currency, monthStartDay: startDay, timeZone });
      queryClient.setQueryData(budgetKeys.detail(budget.id), budget);
      await queryClient.invalidateQueries({ queryKey: budgetKeys.mine });
      auth.setMe(await accountApi.me());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      void registerForPush({ prompt: true });
      router.dismissTo(`/budgets/${budget.id}` as Href);
    } catch (e) {
      setError(e);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormScreen>
      <TextField
        label={t('budgets.new.name')}
        value={name}
        onChangeText={setName}
        placeholder={t('budgets.new.namePlaceholder')}
        maxLength={60}
        autoFocus
        returnKeyType="done"
      />
      <TextField
        label={t('budgets.new.currency')}
        value={currency}
        onChangeText={(v) => setCurrency(v.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={3}
      />
      <DayStepper label={t('budgets.new.startDay')} value={startDay} onChange={setStartDay} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('budgets.new.startDayHint')}
      </ThemedText>
      <ThemedText type="small" accessibilityLiveRegion="polite">
        {t('budgets.monthPreview', {
          start: formatDay(month.start, i18n.language),
          end: formatDay(month.end, i18n.language),
        })}
      </ThemedText>
      <ErrorBanner message={error ? errorMessage(t, error) : null} />
      <Button label={t('budgets.new.submit')} disabled={!canSubmit} loading={submitting} onPress={submit} />
    </FormScreen>
  );
}
