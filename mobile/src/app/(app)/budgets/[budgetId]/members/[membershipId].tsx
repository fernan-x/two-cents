import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/auth/api-client';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { budgetsApi } from '@/features/budgets/api';
import { MemberRow, RoleChoices } from '@/features/budgets/components';
import { formatDate } from '@/features/budgets/format';
import { budgetKeys } from '@/features/budgets/query-keys';
import { useBudget, useCan } from '@/features/budgets/use-can';

type Confirm = 'remove' | 'transfer' | null;

/** US5: change a role, remove someone, or (owner only) transfer ownership (FR-027 to FR-029). */
export default function MemberDetail() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { budgetId, membershipId } = useLocalSearchParams<{ budgetId: string; membershipId: string }>();
  const budget = useBudget(budgetId);
  const canManage = useCan(budgetId, 'members.manage');
  const canTransfer = useCan(budgetId, 'ownership.transfer');
  const members = useQuery({ queryKey: budgetKeys.members(budgetId), queryFn: () => budgetsApi.members(budgetId) });
  const [confirm, setConfirm] = useState<Confirm>(null);

  const member = members.data?.members.find((m) => m.membershipId === membershipId);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['budgets', budgetId] });
  // R11: someone else changed it meanwhile; show the current state.
  const onError = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'STALE_STATE') void refresh();
  };

  const changeRole = useMutation({
    mutationFn: (role: 'admin' | 'member' | 'viewer') => budgetsApi.changeRole(budgetId, membershipId, role),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => budgetsApi.removeMember(budgetId, membershipId),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      await refresh();
      router.back();
    },
    onError,
  });
  const transfer = useMutation({
    mutationFn: () => budgetsApi.transferOwnership(budgetId, membershipId),
    onSuccess: async (detail) => {
      queryClient.setQueryData(budgetKeys.detail(budgetId), detail);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await refresh();
      router.back();
    },
    onError,
  });

  const error = changeRole.error ?? remove.error ?? transfer.error ?? members.error;
  if (!member)
    return (
      <FormScreen>
        <ErrorBanner message={error ? errorMessage(t, error) : null} />
      </FormScreen>
    );

  const manageable = canManage && member.role !== 'owner' && !member.isMe;
  return (
    <FormScreen>
      <Stack.Screen options={{ title: member.displayName }} />
      <MemberRow member={member} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('budgets.member.joined', { date: formatDate(member.joinedAt, i18n.language) })}
      </ThemedText>
      {manageable && member.role !== 'owner' ? (
        <>
          <ThemedText type="smallBold">{t('budgets.member.role')}</ThemedText>
          <RoleChoices value={member.role as 'admin' | 'member' | 'viewer'} onChange={(role) => changeRole.mutate(role)} />
        </>
      ) : null}
      <ErrorBanner message={error ? errorMessage(t, error) : null} />
      {confirm ? (
        <View>
          <ThemedText>
            {confirm === 'remove'
              ? t('budgets.member.removeConfirm', { name: member.displayName })
              : t('budgets.member.transferConfirm', { name: member.displayName })}
          </ThemedText>
          <Button
            label={t('budgets.member.confirm')}
            variant={confirm === 'remove' ? 'danger' : 'primary'}
            loading={remove.isPending || transfer.isPending}
            onPress={() => (confirm === 'remove' ? remove.mutate() : transfer.mutate())}
          />
          <Button label={t('common.cancel')} variant="link" onPress={() => setConfirm(null)} />
        </View>
      ) : (
        <>
          {canTransfer && !member.isMe && budget.data?.myRole === 'owner' ? (
            <Button label={t('budgets.member.transfer')} variant="secondary" onPress={() => setConfirm('transfer')} />
          ) : null}
          {manageable ? (
            <Button label={t('budgets.member.remove')} variant="danger" onPress={() => setConfirm('remove')} />
          ) : null}
        </>
      )}
    </FormScreen>
  );
}
