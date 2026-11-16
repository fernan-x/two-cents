import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { accountApi } from '@/auth/account-api';
import { useAuth } from '@/auth/auth-store';
import { errorMessage } from '@/auth/error-message';
import { Button } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Shown until the email is confirmed (US3); offers to resend the link. */
export function UnconfirmedEmailBanner() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { me } = useAuth();
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (!me || me.emailConfirmed) return null;

  return (
    <View style={[styles.banner, { backgroundColor: theme.warningBackground }]} accessibilityRole="summary">
      <ThemedText style={{ color: theme.warningText }}>✉︎ {t('confirm.banner', { email: me.email })}</ThemedText>
      {status === 'sent' ? (
        <ThemedText type="small" style={{ color: theme.warningText }} accessibilityLiveRegion="polite">
          {t('confirm.sent')}
        </ThemedText>
      ) : (
        <Button
          label={t('confirm.resend')}
          variant="link"
          loading={status === 'sending'}
          onPress={async () => {
            setStatus('sending');
            setError(null);
            try {
              await accountApi.resendConfirmation();
              setStatus('sent');
            } catch (e) {
              setError(errorMessage(t, e));
              setStatus('idle');
            }
          }}
        />
      )}
      {error ? <ThemedText type="small" style={{ color: theme.danger }}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: Radius.md, padding: Spacing.three, gap: Spacing.one },
});
