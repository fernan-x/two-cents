import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-store';
import { deletionApi } from '@/auth/deletion-api';
import { errorMessage } from '@/auth/error-message';
import { useSignOut } from '@/auth/session-actions';
import { Button, ErrorBanner, FormScreen } from '@/components/form';

/** US8: signing in during the 7-day grace period lands here (FR-041b). */
export default function PendingDeletion() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const signOut = useSignOut();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scheduled = auth.me?.deletionScheduledAt
    ? new Intl.DateTimeFormat(i18n.language === 'en' ? 'en-GB' : 'fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(
        new Date(auth.me.deletionScheduledAt),
      )
    : '';

  return (
    <FormScreen title={t('deletion.pendingTitle')} subtitle={t('deletion.pendingBody', { date: scheduled })}>
      <ErrorBanner message={error} />
      <Button
        label={t('deletion.cancel')}
        loading={busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          try {
            const me = await deletionApi.cancel();
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            auth.setMe(me);
          } catch (e) {
            setError(errorMessage(t, e));
          } finally {
            setBusy(false);
          }
        }}
      />
      <Button label={t('settings.signOut')} variant="link" onPress={() => void signOut()} />
    </FormScreen>
  );
}
