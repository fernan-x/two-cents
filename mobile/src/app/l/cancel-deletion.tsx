import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ApiError } from '@/auth/api-client';
import { deletionApi } from '@/auth/deletion-api';
import { Button, FormScreen } from '@/components/form';
import { InvalidLinkScreen } from '@/components/invalid-link-screen';

/** Opened from the "deletion scheduled" email (US8). */
export default function CancelDeletionLink() {
  const { t } = useTranslation();
  const { t: token } = useLocalSearchParams<{ t: string }>();
  const router = useRouter();
  const [state, setState] = useState<'working' | 'done' | 'invalid'>('working');

  useEffect(() => {
    void deletionApi
      .cancelByLink(token)
      .then(() => setState('done'))
      .catch((e: unknown) => setState(e instanceof ApiError && e.code !== 'NETWORK' ? 'invalid' : 'working'));
  }, [token]);

  if (state === 'invalid') return <InvalidLinkScreen />;
  if (state === 'done') {
    return (
      <FormScreen title={t('deletion.cancelledTitle')} subtitle={t('deletion.cancelledBody')}>
        <Button label={t('auth.signIn')} onPress={() => router.replace('/')} />
      </FormScreen>
    );
  }
  return (
    <FormScreen>
      <ActivityIndicator accessibilityLabel={t('common.loading')} />
    </FormScreen>
  );
}
