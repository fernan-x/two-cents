import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { QueryClient } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import Storage from 'expo-sqlite/kv-store';

import { isTrackingKey } from './query-keys';
import { isTrackingMutation } from './mutations';

const KEY = 'two-cents.tracking-cache';

/**
 * Offline recording (research R3): spec 004 queries and every pending transaction write are kept
 * in the app sandbox (expo-sqlite key-value store), so they survive a restart and are sent when
 * the network returns. No secrets here: tokens stay in secure storage (Principle III).
 */
export function trackingPersistOptions(version: string): Omit<PersistQueryClientOptions, 'queryClient'> {
  return {
    persister: createAsyncStoragePersister({ storage: Storage, key: KEY, throttleTime: 500 }),
    maxAge: 7 * 24 * 60 * 60 * 1000,
    buster: version,
    dehydrateOptions: {
      shouldDehydrateQuery: (query) => query.state.status === 'success' && isTrackingKey(query.queryKey),
      // Paused (offline) and failed writes are kept until they are sent or the person discards them.
      shouldDehydrateMutation: (mutation) => isTrackingMutation(mutation.options.mutationKey) && mutation.state.status !== 'success',
    },
  };
}

/** Called on sign-out and account deletion: nothing of the previous person stays on the device. */
export async function clearPersistedTracking(client?: QueryClient): Promise<void> {
  client?.getMutationCache().clear();
  client?.removeQueries({ predicate: (q) => isTrackingKey(q.queryKey) });
  try {
    await Storage.removeItem(KEY);
  } catch {
    // Already gone.
  }
}
