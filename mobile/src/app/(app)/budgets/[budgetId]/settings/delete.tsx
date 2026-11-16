import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { accountApi } from '@/auth/account-api';
import { useAuth } from '@/auth/auth-store';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { budgetsApi } from '@/features/budgets/api';
import { budgetKeys } from '@/features/budgets/query-keys';
import { useBudget } from '@/features/budgets/use-can';

/** US6: the owner deletes the budget by typing its exact name (FR-037); 30 days to restore (FR-038a). */
export default function DeleteBudget() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId);
  const [typed, setTyped] = useState('');
  const name = budget.data?.name ?? '';

  const remove = useMutation({
    mutationFn: () => budgetsApi.remove(budgetId, typed),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      queryClient.removeQueries({ queryKey: ['budgets', budgetId] });
      await queryClient.invalidateQueries({ queryKey: budgetKeys.mine });
      auth.setMe(await accountApi.me());
      router.dismissAll();
      router.replace('/');
    },
  });

  return (
    <FormScreen title={t('budgets.delete.title')}>
      <ThemedText>{t('budgets.delete.explain')}</ThemedText>
      <TextField
        label={t('budgets.delete.typeName', { name })}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ErrorBanner message={remove.error ? errorMessage(t, remove.error) : null} />
      <Button
        label={t('budgets.delete.confirm')}
        variant="danger"
        disabled={!name || typed !== name}
        loading={remove.isPending}
        onPress={() => remove.mutate()}
      />
    </FormScreen>
  );
}
