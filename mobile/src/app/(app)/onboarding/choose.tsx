import { useTranslation } from 'react-i18next';

import { useAuth } from '@/auth/auth-store';
import { useRequireConfirmedEmail } from '@/auth/require-confirmed-email';
import { Button, FormScreen } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { UnconfirmedEmailBanner } from '@/components/unconfirmed-email-banner';

/**
 * FR-045: a user with no budget chooses between creating one and joining with a code.
 * Placeholder until spec 002 provides the budget screens; it owns this route.
 */
export default function OnboardingChoose() {
  const { t } = useTranslation();
  const { me } = useAuth();
  const confirmed = useRequireConfirmedEmail();
  return (
    <FormScreen title={t('onboarding.title', { name: me?.firstName ?? '' })} subtitle={t('onboarding.subtitle')}>
      <Button label={t('onboarding.createBudget')} disabled />
      <Button label={t('onboarding.joinWithCode')} variant="secondary" disabled />
      {!confirmed.allowed ? <ThemedText type="small">{t('confirm.requiredToJoin')}</ThemedText> : null}
      <UnconfirmedEmailBanner />
      <ThemedText type="small" themeColor="textSecondary">
        {t('onboarding.comingSoon')}
      </ThemedText>
    </FormScreen>
  );
}
