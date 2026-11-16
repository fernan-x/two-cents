import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { authApi } from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-store';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, PasswordField, TextField } from '@/components/form';
import { ProviderButtons } from '@/components/provider-buttons';

/** US2: email + password login. Errors never say which field was wrong (FR-006). */
export default function Login() {
  const { t } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await authApi.login({ email: email.trim(), password });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await auth.acceptAuthResult(result);
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormScreen title={t('auth.signIn')}>
      <ProviderButtons />
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="username"
      />
      <PasswordField
        label={t('auth.password')}
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        textContentType="password"
        onSubmitEditing={() => void submit()}
      />
      <ErrorBanner message={error} />
      <Button label={t('auth.signIn')} loading={submitting} disabled={!email.trim() || !password} onPress={() => void submit()} />
      <Button label={t('auth.forgotPassword')} variant="link" onPress={() => router.push('/forgot-password')} />
    </FormScreen>
  );
}
