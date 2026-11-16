import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ApiError } from '../api-client';
import { authApi } from '../auth-api';
import { useAuth } from '../auth-store';
import { errorMessage } from '../error-message';
import { useAppleSignIn } from './use-apple-sign-in';
import { useGoogleSignIn } from './use-google-sign-in';

/** Apple / Google sign-in buttons' behaviour, shared by the welcome and sign-up screens. */
export function useProviderSignIn() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const auth = useAuth();
  const apple = useAppleSignIn();
  const google = useGoogleSignIn();
  const [busy, setBusy] = useState<'apple' | 'google' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locale = i18n.language === 'en' ? 'en' : 'fr';

  async function run(provider: 'apple' | 'google') {
    setError(null);
    setBusy(provider);
    try {
      let result;
      if (provider === 'apple') {
        const credential = await apple.signIn();
        if (!credential) return;
        result = await authApi.apple({ ...credential, locale });
      } else {
        const idToken = await google.signIn();
        if (!idToken) return;
        result = await authApi.google({ idToken, locale });
      }
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await auth.acceptAuthResult(result);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'LINK_REQUIRED' && e.details.linkToken) {
        router.push({
          pathname: '/link-account',
          params: { linkToken: e.details.linkToken, emailHint: e.details.emailHint ?? '', provider },
        });
        return;
      }
      setError(errorMessage(t, e));
    } finally {
      setBusy(null);
    }
  }

  return {
    appleAvailable: apple.available,
    googleAvailable: google.available,
    busy,
    error,
    signInWithApple: () => run('apple'),
    signInWithGoogle: () => run('google'),
  };
}
