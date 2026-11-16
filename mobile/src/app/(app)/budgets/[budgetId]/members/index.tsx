import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { budgetsApi } from '@/features/budgets/api';
import { Card, MemberRow, SectionTitle } from '@/features/budgets/components';
import { formatDate } from '@/features/budgets/format';
import { budgetKeys } from '@/features/budgets/query-keys';
import { roleLabel } from '@/features/budgets/role-label';
import { useBudget, useCan } from '@/features/budgets/use-can';

/** US4/US5: people in the budget, pending invitations, former members, leaving (FR-020, FR-030, FR-032). */
export default function Members() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId);
  const canInvite = useCan(budgetId, 'invitations.manage');
  const canManage = useCan(budgetId, 'members.manage');
  const members = useQuery({ queryKey: budgetKeys.members(budgetId), queryFn: () => budgetsApi.members(budgetId) });
  const invitations = useQuery({
    queryKey: budgetKeys.invitations(budgetId),
    queryFn: () => budgetsApi.invitations(budgetId),
    enabled: canInvite,
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['budgets', budgetId] });
  const resend = useMutation({
    mutationFn: (id: string) => budgetsApi.resendInvitation(budgetId, id),
    onSuccess: async (inv) => {
      setNotice(t('budgets.members.resent', { code: inv.code }));
      await refresh();
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => budgetsApi.revokeInvitation(budgetId, id),
    onSuccess: async () => {
      setConfirmRevoke(null);
      await refresh();
    },
  });
  const leave = useMutation({
    mutationFn: () => budgetsApi.leave(budgetId),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      queryClient.removeQueries({ queryKey: ['budgets', budgetId] });
      await queryClient.invalidateQueries({ queryKey: budgetKeys.mine });
      router.replace('/');
    },
  });

  const isOwner = budget.data?.myRole === 'owner';
  const error = members.error ?? invitations.error ?? resend.error ?? revoke.error ?? leave.error;
  const pending = invitations.data?.invitations ?? [];

  return (
    <FormScreen>
      {members.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
      <Card>
        {members.data?.members.map((m) => (
          <MemberRow
            key={m.membershipId}
            member={m}
            onPress={
              canManage && !m.isMe && m.role !== 'owner'
                ? () => router.push(`/budgets/${budgetId}/members/${m.membershipId}` as Href)
                : undefined
            }
          />
        ))}
      </Card>
      {canInvite ? (
        <>
          <Button label={t('budgets.members.invite')} onPress={() => router.push(`/budgets/${budgetId}/members/invite` as Href)} />
          <ThemedText type="small" themeColor="textSecondary">
            {t('budgets.members.full')}
          </ThemedText>
        </>
      ) : null}

      {canInvite && pending.length > 0 ? (
        <>
          <SectionTitle>{t('budgets.members.pending')}</SectionTitle>
          {pending.map((inv) => (
            <Card key={inv.id}>
              <ThemedText type="smallBold">
                {inv.email ? t('budgets.members.emailInvite', { email: inv.email }) : t('budgets.members.codeInvite')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {roleLabel(t, inv.role)} · {t('budgets.members.sentOn', { date: formatDate(inv.lastSentAt, i18n.language) })} ·{' '}
                {t('budgets.members.expiresOn', { date: formatDate(inv.expiresAt, i18n.language) })}
              </ThemedText>
              {confirmRevoke === inv.id ? (
                <View>
                  <ThemedText type="small">{t('budgets.members.revokeConfirm')}</ThemedText>
                  <Button label={t('budgets.members.revoke')} variant="danger" loading={revoke.isPending} onPress={() => revoke.mutate(inv.id)} />
                  <Button label={t('common.cancel')} variant="link" onPress={() => setConfirmRevoke(null)} />
                </View>
              ) : (
                <View>
                  <Button
                    label={t('budgets.members.resend')}
                    variant="link"
                    loading={resend.isPending && resend.variables === inv.id}
                    onPress={() => resend.mutate(inv.id)}
                  />
                  <Button label={t('budgets.members.revoke')} variant="link" onPress={() => setConfirmRevoke(inv.id)} />
                </View>
              )}
            </Card>
          ))}
        </>
      ) : null}
      {notice ? (
        <ThemedText accessibilityLiveRegion="polite" selectable>
          {notice}
        </ThemedText>
      ) : null}

      {members.data && members.data.formerMembers.length > 0 ? (
        <>
          <SectionTitle>{t('budgets.members.former')}</SectionTitle>
          <Card>
            {members.data.formerMembers.map((f) => (
              <ThemedText key={f.membershipId} themeColor="textSecondary">
                {f.displayName ? `${f.displayName} · ${t('budgets.formerMember')}` : t('budgets.anonymousFormerMember')}
              </ThemedText>
            ))}
          </Card>
        </>
      ) : null}

      {canManage ? (
        <Button
          label={t('budgets.members.history')}
          variant="link"
          onPress={() => router.push(`/budgets/${budgetId}/members/history` as Href)}
        />
      ) : null}

      <ErrorBanner message={error ? errorMessage(t, error) : null} />
      {isOwner ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('budgets.members.ownerCannotLeave')}
        </ThemedText>
      ) : confirmLeave ? (
        <View>
          <ThemedText>{t('budgets.members.leaveConfirm', { budget: budget.data?.name ?? '' })}</ThemedText>
          <Button label={t('budgets.members.leave')} variant="danger" loading={leave.isPending} onPress={() => leave.mutate()} />
          <Button label={t('common.cancel')} variant="link" onPress={() => setConfirmLeave(false)} />
        </View>
      ) : budget.data ? (
        <Button label={t('budgets.members.leave')} variant="secondary" onPress={() => setConfirmLeave(true)} />
      ) : null}
    </FormScreen>
  );
}
