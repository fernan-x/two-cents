import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';

import { accountApi } from '@/auth/account-api';
import { ApiError } from '@/auth/api-client';
import { useAuth } from '@/auth/auth-store';
import { Button, FormScreen } from '@/components/form';
import { InvalidLinkScreen } from '@/components/invalid-link-screen';

type State = 'working' | 'done' | 'invalid';

/** Opened from the confirmation email (US3). */
export default function ConfirmEmailLink() {
  const { t } = useTranslation();
  const { t: token } = useLocalSearchParams<{ t: string }>();
  const router = useRouter();
  const auth = useAuth();
  const [state, setState] = useState<State>('working');

  useEffect(() => {
    void (async () => {
      try {
        const { me } = await accountApi.confirmEmail(token);
        if (auth.me?.id === me.id) auth.setMe(me);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setState('done');
      } catch (e) {
        setState(e instanceof ApiError && e.code !== 'NETWORK' ? 'invalid' : 'working');
      }
    })();
    // Runs once per opened link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (state === 'invalid') {
    return (
      <InvalidLinkScreen
        action={
          auth.status === 'signedIn'
            ? { label: t('confirm.resend'), onPress: () => void accountApi.resendConfirmation().then(() => router.replace('/')) }
            : undefined
        }
      />
    );
  }
  if (state === 'done') {
    return (
      <FormScreen title={t('confirm.doneTitle')} subtitle={t('confirm.doneBody')}>
        <Button label={t('common.continue')} onPress={() => router.replace('/')} />
      </FormScreen>
    );
  }
  return (
    <FormScreen>
      <ActivityIndicator accessibilityLabel={t('common.loading')} />
    </FormScreen>
  );
}
