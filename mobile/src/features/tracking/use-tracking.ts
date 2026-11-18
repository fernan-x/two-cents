import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MonthDetail, MonthTransactionsView, TrackingView, TransactionHints } from '@two-cents/shared/contracts';
import { useIsFocused } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useMonth } from '@/features/planning/use-month';

import { trackingApi } from './api';
import { localTracking } from './local-tracking';
import type { LocalTransaction } from './mutations';
import { trackingKeys } from './query-keys';

/** Same cadence as the 003 month screen: the partner's changes appear within 5 s (FR-021). */
export const TRACKING_POLL_MS = 2000;

function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const s = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => s.remove();
  }, []);
  return active;
}

export type ListData = Omit<MonthTransactionsView, 'transactions'> & { transactions: LocalTransaction[] };

/** A month's transactions, polled with ETag; pending rows from offline writes are kept (R3, R4). */
export function useMonthTransactions(budgetId: string, monthStart: string) {
  const client = useQueryClient();
  const focused = useIsFocused();
  const active = useAppActive();
  const key = trackingKeys.transactions(budgetId, monthStart);
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<ListData> => {
      const cached = client.getQueryData<ListData>(key);
      const result = await trackingApi.transactions(budgetId, monthStart, cached ? `"${cached.revision}"` : null);
      if (result.notModified) {
        if (!cached) throw new Error('304 without a cached list');
        return cached;
      }
      // Keep rows still waiting to sync: the server does not know them yet.
      const pending = (cached?.transactions ?? []).filter((r) => r._pending && !result.data.transactions.some((t) => t.id === r.id));
      return { ...result.data, transactions: [...pending, ...result.data.transactions] };
    },
    refetchInterval: focused && active ? TRACKING_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
}

/** Server planned vs actual, polled with ETag (US2). */
export function useServerTracking(budgetId: string, monthStart: string) {
  const client = useQueryClient();
  const focused = useIsFocused();
  const active = useAppActive();
  const key = trackingKeys.tracking(budgetId, monthStart);
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<TrackingView> => {
      const cached = client.getQueryData<TrackingView>(key);
      const result = await trackingApi.tracking(budgetId, monthStart, cached ? `"${cached.revision}"` : null);
      if (result.notModified) {
        if (!cached) throw new Error('304 without cached tracking');
        return cached;
      }
      return result.data;
    },
    refetchInterval: focused && active ? TRACKING_POLL_MS : false,
    refetchIntervalInBackground: false,
  });
}

/**
 * What the tracking screen shows: the server's figures, or, while writes wait to sync, the same
 * figures recomputed on the device with the shared functions (research R3, Principle II).
 */
export function useTracking(budgetId: string, monthStart: string): {
  data: TrackingView | undefined;
  month: MonthDetail | undefined;
  pending: boolean;
  isLoading: boolean;
  error: unknown;
} {
  const server = useServerTracking(budgetId, monthStart);
  const list = useMonthTransactions(budgetId, monthStart);
  const month = useMonth(budgetId, monthStart);
  const pending = !!list.data?.transactions.some((r) => r._pending);
  const data = useMemo(() => {
    if (pending && month.data && list.data) return localTracking(month.data, list.data.transactions, server.data);
    return server.data;
  }, [pending, month.data, list.data, server.data]);
  return { data, month: month.data, pending, isLoading: server.isLoading && !data, error: server.error };
}

/** Line suggestions and chip order, kept offline (US4, research R6). */
export function useHints(budgetId: string) {
  const client = useQueryClient();
  const key = trackingKeys.hints(budgetId);
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<TransactionHints & { etag?: string | null }> => {
      const cached = client.getQueryData<TransactionHints & { etag?: string | null }>(key);
      const result = await trackingApi.hints(budgetId, cached?.etag ?? null);
      if (result.notModified) {
        if (!cached) throw new Error('304 without cached hints');
        return cached;
      }
      return { ...result.data, etag: result.etag };
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
