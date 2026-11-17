import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MonthDetail } from '@two-cents/shared/contracts';
import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { planningApi } from './api';
import { readOnlyWhenOffline, useIsOnline } from './online';
import { planningKeys } from './query-keys';

/** How often an open month checks for the partner's edits (research R4: < 5 s end to end). */
export const MONTH_POLL_MS = 2000;

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => subscription.remove();
  }, []);
  return active;
}

/**
 * A month, kept fresh by a conditional GET every 2 s while its screen is focused and the app is in
 * the foreground; an unchanged month answers 304 and the cached detail is kept (research R4).
 */
export function useMonth(budgetId: string, start: string) {
  const client = useQueryClient();
  const focused = useIsFocused();
  const active = useAppActive();
  const online = useIsOnline();
  const key = planningKeys.month(budgetId, start);
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<MonthDetail> => {
      const cached = client.getQueryData<MonthDetail>(key);
      const result = await planningApi.month(budgetId, start, cached ? `"${cached.month.revision}"` : null);
      if (result.notModified) {
        if (!cached) throw new Error('304 without a cached month');
        return cached;
      }
      return result.data;
    },
    refetchInterval: focused && active ? MONTH_POLL_MS : false,
    refetchIntervalInBackground: false,
    // Offline, the cached month stays readable but nothing can be edited (research R17).
    select: (detail) => readOnlyWhenOffline(detail, online),
  });
}

/**
 * A write to a month. Every month write answers with the fresh `MonthDetail`, which replaces the
 * cache at once so the author's screen updates without waiting for the next poll.
 */
export function useMonthMutation<V>(budgetId: string, start: string, write: (vars: V) => Promise<MonthDetail>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: write,
    onSuccess: (detail) => {
      client.setQueryData(planningKeys.month(budgetId, start), detail);
      void client.invalidateQueries({ queryKey: planningKeys.months(budgetId) });
    },
  });
}
