import { useQueryClient } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';

import { trackingMutations } from './mutations';

/** Spec 004 writes waiting for the network or refused by the server, kept fresh (US3, FR-016). */
export function useSyncState() {
  const client = useQueryClient();
  const cache = client.getMutationCache();
  const version = useSyncExternalStore(
    (l) => cache.subscribe(l),
    () => cache.getAll().map((m) => `${m.mutationId}:${m.state.status}:${m.state.isPaused}`).join('|'),
  );
  void version;
  return trackingMutations(client);
}
