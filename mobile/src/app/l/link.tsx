import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { ApiError } from '@/auth/api-client';
import { authApi } from '@/auth/auth-api';
import { useAuth } from '@/auth/auth-store';
import { FormScreen } from '@/components/form';
import { InvalidLinkScreen } from '@/components/invalid-link-screen';

/** Opened from the "link your account" email (contracts/deep-links.md). */
export default function LinkFromEmail() {
  const { t: token } = useLocalSearchParams<{ t: string }>();
  const auth = useAuth();
  const router = useRouter();
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const result = await authApi.confirmLink(token);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await auth.acceptAuthResult(result);
        router.replace('/');
      } catch (e) {
        if (e instanceof ApiError) setInvalid(true);
      }
    })();
    // Runs once per opened link.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (invalid) return <InvalidLinkScreen />;
  return (
    <FormScreen>
      <ActivityIndicator accessibilityLabel="…" />
    </FormScreen>
  );
}
