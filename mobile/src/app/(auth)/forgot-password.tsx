import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { authApi } from '@/auth/auth-api';
import { errorMessage } from '@/auth/error-message';
import { Button, ErrorBanner, FormScreen, TextField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';

/** US4: request a reset link. The confirmation is the same whether or not the email exists (FR-006). */
export default function ForgotPassword() {
  const { t, i18n } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await authApi.forgotPassword(email.trim(), i18n.language === 'en' ? 'en' : 'fr');
      setSent(true);
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormScreen title={t('reset.forgotTitle')} subtitle={sent ? undefined : t('reset.forgotBody')}>
      {sent ? (
        <ThemedText accessibilityLiveRegion="polite">{t('reset.sent')}</ThemedText>
      ) : (
        <>
          <TextField
            label={t('auth.email')}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            onSubmitEditing={() => email.trim() && void submit()}
          />
          <ErrorBanner message={error} />
          <Button label={t('reset.sendLink')} loading={submitting} disabled={!email.trim()} onPress={() => void submit()} />
        </>
      )}
    </FormScreen>
  );
}
