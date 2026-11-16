import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-store';
import { useSignOut } from '@/auth/session-actions';
import { Button, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { UnconfirmedEmailBanner } from '@/components/unconfirmed-email-banner';
import { Spacing } from '@/constants/theme';

/** Account settings hub. */
export default function Settings() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me } = useAuth();
  const signOut = useSignOut();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <FormScreen>
      <Stack.Screen options={{ title: t('settings.title') }} />
      <View style={styles.header}>
        <ThemedText type="subtitle">{me?.firstName}</ThemedText>
        <ThemedText themeColor="textSecondary">{me?.email}</ThemedText>
      </View>
      <UnconfirmedEmailBanner />
      <Button label={t('profile.title')} variant="secondary" onPress={() => router.push('/settings/profile')} />
      <Button label={t('sessions.title')} variant="secondary" onPress={() => router.push('/settings/sessions')} />
      <Button label={t('lock.settingsTitle')} variant="secondary" onPress={() => router.push('/settings/security')} />
      <Button label={t('export.title')} variant="secondary" onPress={() => router.push('/settings/export')} />
      <Button label={t('deletion.title')} variant="link" onPress={() => router.push('/settings/delete-account')} />
      <Button
        label={t('settings.signOut')}
        variant="secondary"
        loading={signingOut}
        onPress={async () => {
          setSigningOut(true);
          await signOut();
        }}
      />
      <Button label={t('common.back')} variant="link" onPress={() => router.replace('/')} />
    </FormScreen>
  );
}

const styles = StyleSheet.create({ header: { gap: Spacing.one } });
