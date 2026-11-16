import { Redirect } from 'expo-router';

import { useAuth } from '@/auth/auth-store';

/** Entry point once signed in: users without a budget go to onboarding (FR-045). */
export default function AppHome() {
  const { me } = useAuth();
  if (!me?.hasBudget) return <Redirect href="/onboarding/choose" />;
  // Budget home is provided by spec 002.
  return <Redirect href="/settings" />;
}
