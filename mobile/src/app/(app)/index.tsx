import { useQuery } from '@tanstack/react-query';
import { type Href, Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { pickActiveBudget } from '@/features/budgets/active-budget';
import { budgetsApi } from '@/features/budgets/api';
import { pendingInvite, signUpPrompt } from '@/features/budgets/pending-invite';
import { budgetKeys } from '@/features/budgets/query-keys';

/**
 * Entry point once signed in (FR-015, FR-016a, FR-036): a held invitation first, then the last budget
 * used, then — right after sign-up — "Vous avez un code d'invitation ?", else "create or join".
 */
export default function AppHome() {
  const { t } = useTranslation();
  const [invite, setInvite] = useState<string | null | undefined>(undefined);
  const mine = useQuery({ queryKey: budgetKeys.mine, queryFn: budgetsApi.mine });

  useEffect(() => {
    void pendingInvite.peek().then(setInvite);
  }, []);

  if (invite) return <Redirect href={`/i/${invite}` as Href} />;
  if (invite === undefined || mine.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} />
      </View>
    );
  }
  const active = mine.data ? pickActiveBudget(mine.data.budgets) : null;
  if (active) return <Redirect href={`/budgets/${active.id}` as Href} />;
  if (signUpPrompt.consume()) return <Redirect href={'/onboarding/join-code?afterSignUp=1' as Href} />;
  return <Redirect href={'/onboarding/choose' as Href} />;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center' } });
