import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-store';
import { deletionApi } from '@/auth/deletion-api';
import { errorMessage } from '@/auth/error-message';
import { useAppleSignIn } from '@/auth/providers/use-apple-sign-in';
import { useGoogleSignIn } from '@/auth/providers/use-google-sign-in';
import { Button, ErrorBanner, FormScreen, PasswordField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** US8: one flow — consequences, optional export, re-authentication, confirmation (FR-041). */
export default function DeleteAccount() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const apple = useAppleSignIn();
  const google = useGoogleSignIn();
  const methods = auth.me?.signInMethods ?? [];
  const preview = useQuery({ queryKey: ['me', 'deletion-preview'], queryFn: deletionApi.preview });
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const date = (iso: string) =>
    new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'long' }).format(new Date(iso));

  async function confirm(reauthBody: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const { reauthToken } = await deletionApi.reauthenticate(reauthBody);
      await deletionApi.request(reauthToken);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      // All sessions ended on the server; back to the welcome screen.
      await auth.signOutLocally('account_deletion');
    } catch (e) {
      setError(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('deletion.title') }} />
      {preview.isPending ? <ActivityIndicator accessibilityLabel={t('common.loading')} /> : null}
      {preview.data ? (
        <View style={styles.section}>
          <ThemedText>{t('deletion.when', { date: date(preview.data.scheduledAt) })}</ThemedText>
          {preview.data.budgetsDeleted.length > 0 ? (
            <ThemedText>
              {t('deletion.budgetsDeleted')} {preview.data.budgetsDeleted.map((b) => b.name).join(', ')}
            </ThemedText>
          ) : null}
          {preview.data.budgetsLeft.length > 0 ? (
            <ThemedText>
              {t('deletion.budgetsLeft')} {preview.data.budgetsLeft.map((b) => b.name).join(', ')}
            </ThemedText>
          ) : null}
          <ThemedText themeColor="textSecondary">{t('deletion.formerMember')}</ThemedText>
        </View>
      ) : null}
      <Button label={t('deletion.exportFirst')} variant="secondary" onPress={() => router.push('/settings/export')} />

      <ThemedText type="smallBold">{t('deletion.confirmIdentity')}</ThemedText>
      {methods.includes('password') ? (
        <>
          <PasswordField label={t('lock.password')} value={password} onChangeText={setPassword} autoComplete="current-password" />
          <Button
            label={t('deletion.confirm')}
            variant="danger"
            loading={busy}
            disabled={!password}
            onPress={() => void confirm({ password })}
          />
        </>
      ) : null}
      {methods.includes('apple') && apple.available ? (
        <Button
          label={t('deletion.confirmWithApple')}
          variant="danger"
          disabled={busy}
          onPress={async () => {
            const credential = await apple.signIn();
            if (credential) await confirm({ provider: 'apple', identityToken: credential.identityToken });
          }}
        />
      ) : null}
      {methods.includes('google') && google.available ? (
        <Button
          label={t('deletion.confirmWithGoogle')}
          variant="danger"
          disabled={busy}
          onPress={async () => {
            const idToken = await google.signIn();
            if (idToken) await confirm({ provider: 'google', idToken });
          }}
        />
      ) : null}
      <ErrorBanner message={error} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({ section: { gap: Spacing.two } });
