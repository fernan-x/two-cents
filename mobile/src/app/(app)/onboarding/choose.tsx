import { type Href, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-store';
import { useRequireConfirmedEmail } from '@/auth/require-confirmed-email';
import { Button, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { UnconfirmedEmailBanner } from '@/components/unconfirmed-email-banner';

/** 001 FR-045 / 002 FR-016a: a person with no budget creates one or joins with a code. */
export default function OnboardingChoose() {
  const { t } = useTranslation();
  const router = useRouter();
  const { me } = useAuth();
  const confirmed = useRequireConfirmedEmail();
  return (
    <FormScreen title={t('onboarding.title', { name: me?.firstName ?? '' })} subtitle={t('onboarding.subtitle')}>
      <Button label={t('onboarding.createBudget')} onPress={() => router.push('/budgets/new' as Href)} />
      <Button
        label={t('onboarding.joinWithCode')}
        variant="secondary"
        disabled={!confirmed.allowed}
        onPress={() => router.push('/onboarding/join-code' as Href)}
      />
      {!confirmed.allowed ? <ThemedText type="small">{t('confirm.requiredToJoin')}</ThemedText> : null}
      <UnconfirmedEmailBanner />
      <Button label={t('settings.title')} variant="link" onPress={() => router.push('/settings')} />
    </FormScreen>
  );
}
