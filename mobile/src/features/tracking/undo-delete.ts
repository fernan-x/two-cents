import type { QueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { type DeleteVars, runTrackingMutation } from './mutations';
import { trackingKeys } from './query-keys';

export const UNDO_MS = 10_000;

interface Scheduled {
  vars: DeleteVars;
  timer: ReturnType<typeof setTimeout>;
}
let scheduled: Scheduled[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * FR-019: a deletion waits 10 s before it is sent, so "Annuler" simply cancels it (research R13).
 * The row is hidden at once; undoing brings it back with the next refresh.
 */
export function scheduleDelete(client: QueryClient, vars: DeleteVars): void {
  client.setQueryData<{ transactions: { id: string }[] }>(trackingKeys.transactions(vars.budgetId, vars.monthStart), (d) =>
    d ? { ...d, transactions: d.transactions.filter((r) => r.id !== vars.txnId) } : d,
  );
  const timer = setTimeout(() => {
    scheduled = scheduled.filter((s) => s.vars.txnId !== vars.txnId);
    emit();
    void runTrackingMutation(client, 'delete', vars).catch(() => undefined);
  }, UNDO_MS);
  scheduled = [...scheduled, { vars, timer }];
  emit();
}

export function undoDelete(client: QueryClient, txnId: string): void {
  const s = scheduled.find((x) => x.vars.txnId === txnId);
  if (!s) return;
  clearTimeout(s.timer);
  scheduled = scheduled.filter((x) => x !== s);
  emit();
  void client.invalidateQueries({ queryKey: trackingKeys.transactions(s.vars.budgetId, s.vars.monthStart) });
}

export function useScheduledDeletes(): readonly DeleteVars[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => scheduled,
    () => scheduled,
  ).map((s) => s.vars);
}
