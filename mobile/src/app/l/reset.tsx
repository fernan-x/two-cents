import { PASSWORD_MIN_LENGTH, validatePasswordPolicy } from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/auth/api-client';
import { authApi } from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-store';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, PasswordField } from '@/components/form';
import { InvalidLinkScreen } from '@/components/invalid-link-screen';

/** Opened from the reset email (US4). */
export default function ResetPassword() {
  const { t } = useTranslation();
  const { t: token } = useLocalSearchParams<{ t: string }>();
  const router = useRouter();
  const auth = useAuth();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<'form' | 'done' | 'invalid'>('form');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Every session ended on the server, this device's included.
      if (auth.status !== 'signedOut') await auth.signOutLocally('password_changed');
      setState('done');
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TOKEN_INVALID') setState('invalid');
      else setError(errorMessage(t, e));
    } finally {
      setSubmitting(false);
    }
  }

  if (state === 'invalid') {
    return <InvalidLinkScreen action={{ label: t('reset.newLink'), onPress: () => router.replace('/forgot-password') }} />;
  }
  if (state === 'done') {
    return (
      <FormScreen title={t('reset.doneTitle')} subtitle={t('reset.doneBody')}>
        <Button label={t('auth.signIn')} onPress={() => router.replace('/login')} />
      </FormScreen>
    );
  }
  return (
    <FormScreen title={t('reset.newTitle')}>
      <PasswordField
        label={t('reset.newPassword')}
        hint={t('auth.passwordHint', { count: PASSWORD_MIN_LENGTH })}
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <ErrorBanner message={error} />
      <Button
        label={t('reset.save')}
        loading={submitting}
        disabled={!validatePasswordPolicy(password).ok}
        onPress={() => void submit()}
      />
    </FormScreen>
  );
}
