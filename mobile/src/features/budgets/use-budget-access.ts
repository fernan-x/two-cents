import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { ApiError } from '@/auth/api-client';
import { accountApi } from '@/auth/account-api';
import { useAuth } from '@/auth/auth-store';

import { budgetKeys } from './query-keys';
import { useBudget } from './use-can';

/**
 * FR-031 / US5 scenario 6: when the server says a budget is gone for this person (removed, left,
 * deleted), its cache is dropped and the app goes back to its entry point, which opens another
 * budget or the "create or join" screen.
 */
export function useBudgetAccess(budgetId: string) {
  const query = useBudget(budgetId);
  const queryClient = useQueryClient();
  const router = useRouter();
  const auth = useAuth();
  const lost = query.error instanceof ApiError && query.error.code === 'BUDGET_NOT_FOUND';

  useEffect(() => {
    if (!lost) return;
    queryClient.removeQueries({ queryKey: ['budgets', budgetId] });
    void queryClient.invalidateQueries({ queryKey: budgetKeys.mine });
    void accountApi
      .me()
      .then(auth.setMe)
      .catch(() => undefined);
    router.replace('/');
  }, [lost, budgetId, queryClient, router, auth.setMe]);

  return query;
}
