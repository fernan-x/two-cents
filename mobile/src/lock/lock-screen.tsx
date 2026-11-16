import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { apiRequest } from '@/auth/api-client';
import { useAuth } from '@/auth/auth-store';
import { errorMessage } from '@/auth/error-message';
import { useAppleSignIn } from '@/auth/providers/use-apple-sign-in';
import { useGoogleSignIn } from '@/auth/providers/use-google-sign-in';
import { secureStorage } from '@/auth/secure-storage';
import { Button, ErrorBanner, FormScreen, PasswordField } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { biometricMarker } from './biometric-marker';

/**
 * Full-screen lock (US5). Nothing behind it is rendered to screen readers.
 * Fallbacks: account password or Apple/Google — never the device passcode (FR-037).
 */
export function LockScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const auth = useAuth();
  const apple = useAppleSignIn();
  const google = useGoogleSignIn();
  const methods = auth.me?.signInMethods ?? [];
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const unlocked = useCallback(async () => {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    auth.unlock();
  }, [auth]);

  const tryBiometric = useCallback(async () => {
    const result = await biometricMarker.unlock(t('lock.prompt'));
    if (result === 'success') return unlocked();
    if (result === 'fallbackRequired') {
      const settings = await secureStorage.getLockSettings();
      await secureStorage.setLockSettings({ ...settings, biometricEnabled: false });
      setBiometricEnabled(false);
      setMessage(t('lock.enrolmentChanged'));
    }
    setShowFallback(true);
  }, [t, unlocked]);

  useEffect(() => {
    void secureStorage.getLockSettings().then((s) => {
      setBiometricEnabled(s.biometricEnabled);
      if (s.biometricEnabled) void tryBiometric();
      else setShowFallback(true);
    });
  }, [tryBiometric]);

  async function reauth(body: Record<string, unknown>) {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest('POST', '/v1/auth/reauthenticate', { body });
      await unlocked();
    } catch (e) {
      setMessage(errorMessage(t, e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} accessibilityViewIsModal>
      <FormScreen title={t('lock.title')} subtitle={t('lock.subtitle', { name: auth.me?.firstName ?? '' })}>
        {biometricEnabled ? <Button label={t('lock.useBiometrics')} onPress={() => void tryBiometric()} /> : null}
        <ErrorBanner message={message} />
        {showFallback ? (
          <View style={styles.fallback}>
            {methods.includes('password') ? (
              <>
                <PasswordField label={t('lock.password')} value={password} onChangeText={setPassword} autoComplete="current-password" />
                <Button
                  label={t('lock.unlock')}
                  variant={biometricEnabled ? 'secondary' : 'primary'}
                  loading={busy}
                  disabled={!password}
                  onPress={() => void reauth({ password })}
                />
              </>
            ) : null}
            {methods.includes('apple') && apple.available ? (
              <Button
                label={t('lock.withApple')}
                variant="secondary"
                onPress={async () => {
                  const credential = await apple.signIn();
                  if (credential) await reauth({ provider: 'apple', identityToken: credential.identityToken });
                }}
              />
            ) : null}
            {methods.includes('google') && google.available ? (
              <Button
                label={t('lock.withGoogle')}
                variant="secondary"
                onPress={async () => {
                  const idToken = await google.signIn();
                  if (idToken) await reauth({ provider: 'google', idToken });
                }}
              />
            ) : null}
            <ThemedText type="small" themeColor="textSecondary">
              {t('lock.offlineNote')}
            </ThemedText>
          </View>
        ) : null}
      </FormScreen>
    </View>
  );
}

const styles = StyleSheet.create({ fallback: { gap: Spacing.three } });
