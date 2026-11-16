import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-store';
import { Button, ErrorBanner, FormScreen } from '@/components/form';
import { ProviderButtons } from '@/components/provider-buttons';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** First screen when signed out (US1). */
export default function Welcome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { endReason, clearEndReason } = useAuth();
  return (
    <FormScreen>
      <View style={styles.hero}>
        <ThemedText type="title" accessibilityRole="header">
          {t('common.appName')}
        </ThemedText>
        <ThemedText themeColor="textSecondary">{t('auth.tagline')}</ThemedText>
      </View>
      <ErrorBanner message={endReason ? t(`auth.sessionEnded.${endReason}`) : null} />
      <ProviderButtons />
      <Button
        label={t('auth.createAccount')}
        onPress={() => {
          clearEndReason();
          router.push('/sign-up');
        }}
      />
      <Button
        label={t('auth.signIn')}
        variant="secondary"
        onPress={() => {
          clearEndReason();
          router.push('/login');
        }}
      />
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: Spacing.two, paddingTop: Spacing.six, paddingBottom: Spacing.four },
});
