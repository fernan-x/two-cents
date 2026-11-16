import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatInviteCode, normalizeInviteCode } from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { type Href, Redirect, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/auth/api-client';
import { accountApi } from '@/auth/account-api';
import { useAuth } from '@/auth/auth-store';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { UnconfirmedEmailBanner } from '@/components/unconfirmed-email-banner';
import { Spacing } from '@/constants/theme';
import { budgetsApi } from '@/features/budgets/api';
import { Card } from '@/features/budgets/components';
import { formatDate } from '@/features/budgets/format';
import { pendingInvite } from '@/features/budgets/pending-invite';
import { budgetKeys } from '@/features/budgets/query-keys';
import { roleLabel } from '@/features/budgets/role-label';
import { registerForPush } from '@/notifications/push-registration';

/**
 * US2 invitation screen, the target of `https://<app-domain>/i/<CODE>` and of typed codes (FR-017,
 * FR-018). Signed out, the code is kept and the person goes through sign-up or sign-in first (FR-015).
 */
export default function InvitationScreen() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const auth = useAuth();
  const code = normalizeInviteCode(raw ?? '');
  const signedOut = auth.status === 'signedOut';
  const [saved, setSaved] = useState(!signedOut);

  useEffect(() => {
    if (!code) return;
    // Signed out: hold the code until signed in. Signed in: it's being handled here, forget it.
    if (signedOut) void pendingInvite.save(code).then(() => setSaved(true));
    else void pendingInvite.clear();
  }, [code, signedOut]);

  if (signedOut) return saved ? <Redirect href="/" /> : null;
  return <SignedInInvitation code={code} />;
}

function SignedInInvitation({ code }: { code: string | null }) {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const auth = useAuth();
  const [declined, setDeclined] = useState(false);

  const preview = useQuery({
    // Refetched once the email gets confirmed (001 FR-011 blocks joining until then).
    queryKey: ['invitation', code, auth.me?.emailConfirmed],
    queryFn: () => budgetsApi.previewInvitation(code!),
    enabled: code !== null,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => budgetsApi.acceptInvitation(code!),
    onSuccess: async (result) => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await queryClient.invalidateQueries({ queryKey: budgetKeys.mine });
      auth.setMe(await accountApi.me());
      void registerForPush({ prompt: true });
      router.replace(
        (result.askIncome ? `/budgets/${result.budgetId}/income` : `/budgets/${result.budgetId}`) as Href,
      );
    },
  });
  const decline = useMutation({
    mutationFn: () => budgetsApi.declineInvitation(code!),
    onSuccess: async () => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      setDeclined(true);
    },
  });

  const home = <Button label={t('budgets.invitation.home')} variant="link" onPress={() => router.replace('/')} />;
  const title = <Stack.Screen options={{ headerShown: true, title: t('budgets.invitation.title') }} />;

  if (!code)
    return (
      <FormScreen title={t('budgets.invitation.notFound')}>
        {title}
        {home}
      </FormScreen>
    );
  if (declined)
    return (
      <FormScreen title={t('budgets.invitation.declined')}>
        {title}
        {home}
      </FormScreen>
    );
  if (preview.isPending)
    return (
      <View style={styles.center}>
        {title}
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );

  const failure = preview.error ?? accept.error ?? decline.error;
  const gone = goneMessage(t, failure);
  if (gone) {
    const budgetId = failure instanceof ApiError ? failure.details.budgetId : undefined;
    return (
      <FormScreen title={gone}>
        {title}
        <ThemedText themeColor="textSecondary">{formatInviteCode(code)}</ThemedText>
        {budgetId ? (
          <Button
            label={t('budgets.invitation.openBudget')}
            onPress={() => router.replace(`/budgets/${budgetId}` as Href)}
          />
        ) : null}
        {home}
      </FormScreen>
    );
  }

  const p = preview.data;
  return (
    <FormScreen>
      {title}
      {p ? (
        <Card>
          <ThemedText type="subtitle" accessibilityRole="header">
            {t('budgets.invitation.invitedBy', { name: p.inviterName })}
          </ThemedText>
          <ThemedText type="smallBold">{t('budgets.invitation.toBudget', { budget: p.budgetName })}</ThemedText>
          <ThemedText>{t('budgets.invitation.role', { role: roleLabel(t, p.role) })}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('budgets.invitation.people', { count: p.memberCount })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('budgets.invitation.expires', { date: formatDate(p.expiresAt, i18n.language) })}
          </ThemedText>
        </Card>
      ) : null}
      <UnconfirmedEmailBanner />
      <ErrorBanner message={failure ? errorMessage(t, failure) : null} />
      {failure instanceof ApiError && failure.code === 'EMAIL_NOT_CONFIRMED' ? (
        <Button
          label={t('common.retry')}
          variant="secondary"
          onPress={async () => {
            auth.setMe(await accountApi.me());
            await preview.refetch();
          }}
        />
      ) : null}
      <View style={styles.actions}>
        <Button
          label={t('budgets.invitation.accept')}
          loading={accept.isPending}
          disabled={!p || decline.isPending}
          onPress={() => accept.mutate()}
        />
        <Button
          label={t('budgets.invitation.decline')}
          variant="secondary"
          loading={decline.isPending}
          disabled={!p || accept.isPending}
          onPress={() => decline.mutate()}
        />
      </View>
    </FormScreen>
  );
}

/** FR-021: a specific explanation for every invitation that can't be used, never a generic error. */
function goneMessage(t: TFunction, error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;
  const name = error.details.inviterName ?? '';
  switch (error.code) {
    case 'INVITATION_EXPIRED':
      return t('budgets.invitation.expired', { name });
    case 'INVITATION_REVOKED':
      return t('budgets.invitation.revoked');
    case 'INVITATION_USED':
      return t('budgets.invitation.used');
    case 'INVITATION_DECLINED':
      return t('budgets.invitation.declinedGone');
    case 'INVITATION_WRONG_EMAIL':
      return t('budgets.invitation.wrongEmail', { email: error.details.invitedEmailMasked ?? '' });
    case 'ALREADY_MEMBER':
      return t('budgets.invitation.alreadyMember');
    case 'INVITATION_NOT_FOUND':
      return t('budgets.invitation.notFound');
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  actions: { gap: Spacing.two },
});
