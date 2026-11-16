import * as AppleAuthentication from 'expo-apple-authentication';
import { StyleSheet, useColorScheme, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { useProviderSignIn } from '@/auth/providers/use-provider-sign-in';
import { Button, ErrorBanner } from '@/components/form';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';

/** Sign in with Apple (iOS) and Google. */
export function ProviderButtons() {
  const { t } = useTranslation();
  const scheme = useColorScheme();
  const providers = useProviderSignIn();
  return (
    <View style={styles.container}>
      {providers.appleAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={
            scheme === 'dark'
              ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
              : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
          }
          cornerRadius={Radius.md}
          style={styles.apple}
          onPress={() => void providers.signInWithApple()}
        />
      ) : null}
      {providers.googleAvailable ? (
        <Button
          label={t('auth.continueWithGoogle')}
          variant="secondary"
          loading={providers.busy === 'google'}
          onPress={() => void providers.signInWithGoogle()}
        />
      ) : null}
      <ErrorBanner message={providers.error} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  apple: { height: MinTouchTarget + Spacing.two, width: '100%' },
});
