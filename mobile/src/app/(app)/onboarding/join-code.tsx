import { formatInviteCode, normalizeInviteCode } from '@two-cents/shared/domain';
import { type Href, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useRequireConfirmedEmail } from '@/auth/require-confirmed-email';
import { Button, FormScreen, TextField } from '@/components/form';
import { UnconfirmedEmailBanner } from '@/components/unconfirmed-email-banner';

/**
 * FR-016a and FR-018: type the 6-character code. Shown right after sign-up as "Vous avez un code
 * d'invitation ?" (Passer → create or join), and from "Rejoindre avec un code" anytime.
 */
export default function JoinCode() {
  const { t } = useTranslation();
  const router = useRouter();
  const { afterSignUp } = useLocalSearchParams<{ afterSignUp?: string }>();
  const confirmed = useRequireConfirmedEmail();
  const [input, setInput] = useState('');
  const code = normalizeInviteCode(input);

  return (
    <FormScreen
      title={afterSignUp ? t('budgets.join.titleAfterSignUp') : t('budgets.join.title')}
      subtitle={t('budgets.join.subtitle')}>
      <Stack.Screen options={{ title: '' }} />
      <TextField
        label={t('budgets.join.code')}
        value={input}
        onChangeText={(text) => setInput(text.toUpperCase())}
        placeholder="ABC-123"
        autoCapitalize="characters"
        autoCorrect={false}
        autoComplete="one-time-code"
        maxLength={9}
        returnKeyType="go"
        onSubmitEditing={() => code && router.push(`/i/${code}` as Href)}
        style={{ fontSize: 24, letterSpacing: 4 }}
        hint={code ? formatInviteCode(code) : undefined}
      />
      <UnconfirmedEmailBanner />
      <Button
        label={t('budgets.join.submit')}
        disabled={!code || !confirmed.allowed}
        onPress={() => router.push(`/i/${code}` as Href)}
      />
      {afterSignUp ? (
        <Button label={t('budgets.join.skip')} variant="link" onPress={() => router.replace('/onboarding/choose')} />
      ) : null}
    </FormScreen>
  );
}
