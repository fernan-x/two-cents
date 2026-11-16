import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { Button, FormScreen } from '@/components/form';

/** Shown for any expired, used or superseded email link (contracts/deep-links.md). */
export function InvalidLinkScreen({ action }: { action?: { label: string; onPress: () => void } }) {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <FormScreen title={t('links.invalidTitle')} subtitle={t('links.invalidBody')}>
      {action ? <Button label={action.label} onPress={action.onPress} /> : null}
      <Button label={t('common.back')} variant="link" onPress={() => router.replace('/')} />
    </FormScreen>
  );
}
