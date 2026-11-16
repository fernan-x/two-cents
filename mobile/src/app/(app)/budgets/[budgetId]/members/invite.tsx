import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreatedInvitation } from '@two-cents/shared/contracts';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useRequireConfirmedEmail } from '@/auth/require-confirmed-email';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { UnconfirmedEmailBanner } from '@/components/unconfirmed-email-banner';
import { Spacing } from '@/constants/theme';
import { budgetsApi } from '@/features/budgets/api';
import { Card, ChoiceRow, RoleChoices } from '@/features/budgets/components';
import { useBudget } from '@/features/budgets/use-can';

type Kind = 'email' | 'code';
type InvitableRole = 'admin' | 'member' | 'viewer';

/** US2 owner side: invite by email or create a code to share by text message (FR-008 to FR-011). */
export default function Invite() {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { budgetId } = useLocalSearchParams<{ budgetId: string }>();
  const budget = useBudget(budgetId);
  const confirmed = useRequireConfirmedEmail();
  const [kind, setKind] = useState<Kind>('code');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<InvitableRole>('member');
  const [created, setCreated] = useState<CreatedInvitation | null>(null);

  const create = useMutation({
    mutationFn: () =>
      budgetsApi.createInvitation(budgetId, kind === 'email' ? { kind, email: email.trim(), role } : { kind, role }),
    onSuccess: async (inv) => {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCreated(inv);
      await queryClient.invalidateQueries({ queryKey: ['budgets', budgetId] });
    },
  });

  if (created) {
    const share = () =>
      Share.share({
        message: t('budgets.invite.shareMessage', { budget: budget.data?.name ?? '', link: created.link, code: created.code }),
      });
    return (
      <FormScreen>
        {created.email ? (
          <ThemedText accessibilityLiveRegion="polite">
            {created.resent
              ? t('budgets.invite.resentInstead', { email: created.email })
              : t('budgets.invite.sent', { email: created.email })}
          </ThemedText>
        ) : null}
        <Card>
          <ThemedText type="smallBold">{t('budgets.invite.code')}</ThemedText>
          <ThemedText type="title" selectable accessibilityLabel={created.code.split('').join(' ')} style={styles.code}>
            {created.code}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" selectable>
            {created.link}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('budgets.invite.validity')}
          </ThemedText>
        </Card>
        <Button label={t('budgets.invite.share')} onPress={share} />
        <Button label={t('budgets.invite.done')} variant="link" onPress={() => router.back()} />
      </FormScreen>
    );
  }

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  return (
    <FormScreen>
      <View accessibilityRole="radiogroup" style={styles.kinds}>
        <ChoiceRow label={t('budgets.invite.byCode')} selected={kind === 'code'} onPress={() => setKind('code')} />
        <ChoiceRow label={t('budgets.invite.byEmail')} selected={kind === 'email'} onPress={() => setKind('email')} />
      </View>
      {kind === 'email' ? (
        <TextField
          label={t('budgets.invite.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
      ) : null}
      <ThemedText type="smallBold">{t('budgets.invite.role')}</ThemedText>
      <RoleChoices value={role} onChange={setRole} />
      <UnconfirmedEmailBanner />
      <ErrorBanner message={create.error ? errorMessage(t, create.error) : null} />
      <Button
        label={kind === 'email' ? t('budgets.invite.send') : t('budgets.invite.generate')}
        disabled={!confirmed.allowed || (kind === 'email' && !emailOk)}
        loading={create.isPending}
        onPress={() => create.mutate()}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  kinds: { gap: Spacing.two },
  code: { letterSpacing: 4, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
