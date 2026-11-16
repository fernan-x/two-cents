import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { authApi } from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-store';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, PasswordField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';

/** US1 edge case: prove you own the existing account before Apple/Google is linked (FR-007). */
export default function LinkAccount() {
  const { t } = useTranslation();
  const auth = useAuth();
  const { linkToken, emailHint, provider } = useLocalSearchParams<{ linkToken: string; emailHint: string; provider: string }>();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<'password' | 'email' | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerName = provider === 'apple' ? 'Apple' : 'Google';

  async function linkWithPassword() {
    setBusy('password');
    setError(null);
    try {
      const result = await authApi.linkWithPassword({ linkToken, password });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await auth.acceptAuthResult(result);
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(null);
    }
  }

  async function sendEmail() {
    setBusy('email');
    setError(null);
    try {
      await authApi.requestLinkEmail(linkToken);
      setEmailSent(true);
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <FormScreen title={t('auth.link.title')} subtitle={t('auth.link.body', { email: emailHint, provider: providerName })}>
      {emailSent ? (
        <ThemedText accessibilityLiveRegion="polite">{t('auth.link.emailSent', { email: emailHint })}</ThemedText>
      ) : (
        <>
          <PasswordField
            label={t('auth.link.passwordLabel')}
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            textContentType="password"
          />
          <ErrorBanner message={error} />
          <Button
            label={t('auth.link.withPassword', { provider: providerName })}
            loading={busy === 'password'}
            disabled={!password || busy !== null}
            onPress={() => void linkWithPassword()}
          />
          <Button
            label={t('auth.link.withEmail')}
            variant="secondary"
            loading={busy === 'email'}
            disabled={busy !== null}
            onPress={() => void sendEmail()}
          />
        </>
      )}
    </FormScreen>
  );
}
