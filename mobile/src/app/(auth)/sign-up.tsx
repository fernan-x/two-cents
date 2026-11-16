import { PASSWORD_MIN_LENGTH, validatePasswordPolicy } from '@two-cents/shared/domain';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/auth/api-client';
import { authApi } from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-store';
import { signUpPrompt } from '@/features/budgets/pending-invite';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, PasswordField, TextField } from '@/components/form';
import { ProviderButtons } from '@/components/provider-buttons';
import { Spacing } from '@/constants/theme';

/** US1: email + password sign-up. */
export default function SignUp() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | Error | null>(null);

  const passwordOk = validatePasswordPolicy(password).ok;
  const canSubmit = email.trim() && firstName.trim() && passwordOk && !submitting;

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await authApi.signUp({
        email: email.trim(),
        password,
        firstName: firstName.trim(),
        locale: i18n.language === 'en' ? 'en' : 'fr',
      });
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      signUpPrompt.mark();
      await auth.acceptAuthResult(result);
    } catch (e) {
      setError(e as Error);
    } finally {
      setSubmitting(false);
    }
  }

  const emailInUse = error instanceof ApiError && error.code === 'EMAIL_IN_USE';
  return (
    <FormScreen title={t('auth.signUpTitle')}>
      <ProviderButtons />
      <TextField
        label={t('auth.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label={t('auth.firstName')}
        hint={t('auth.firstNameHint')}
        value={firstName}
        onChangeText={setFirstName}
        autoComplete="given-name"
        textContentType="givenName"
        maxLength={50}
      />
      <PasswordField
        label={t('auth.password')}
        hint={t('auth.passwordHint', { count: PASSWORD_MIN_LENGTH })}
        value={password}
        onChangeText={setPassword}
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={() => canSubmit && void submit()}
      />
      <ErrorBanner message={error ? errorMessage(t, error) : null} />
      {emailInUse ? (
        <View style={styles.row}>
          <Button label={t('auth.signIn')} variant="link" onPress={() => router.replace('/login')} />
          <Button label={t('auth.forgotPassword')} variant="link" onPress={() => router.replace('/forgot-password')} />
        </View>
      ) : null}
      <Button label={t('auth.createAccount')} loading={submitting} disabled={!canSubmit} onPress={() => void submit()} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});
