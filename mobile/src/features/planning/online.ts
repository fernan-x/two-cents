import { onlineManager } from '@tanstack/react-query';
import type { MonthDetail } from '@two-cents/shared/contracts';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

const isOnline = (state: NetworkState) => state.isConnected !== false && state.isInternetReachable !== false;

let installed = false;

/**
 * Feeds the device's connectivity to TanStack Query (research R17): offline, queries pause and keep
 * their cached data, so a month stays readable. Native only; safe to call more than once.
 */
export function setupOnlineManager(): void {
  // On web TanStack Query already follows the browser's online/offline events, and expo-network's
  // web module needs `window`, which does not exist during server rendering.
  if (installed || Platform.OS === 'web') return;
  installed = true;
  onlineManager.setEventListener((setOnline) => {
    void getNetworkStateAsync()
      .then((state) => setOnline(isOnline(state)))
      .catch(() => undefined);
    const subscription = addNetworkStateListener((state) => setOnline(isOnline(state)));
    return () => subscription.remove();
  });
}

/** Whether the device is online, as TanStack Query sees it. */
export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline(),
    // Server rendering (web): assume online.
    () => true,
  );
}

/**
 * Offline, a month is shown read-only (spec edge case "Offline"): every edit control reads these
 * flags, so turning them off disables editing everywhere without touching each screen.
 */
export function readOnlyWhenOffline(detail: MonthDetail, online: boolean): MonthDetail {
  if (online) return detail;
  return {
    ...detail,
    can: { editShared: false, changeStatus: [] },
    lines: detail.lines.map((l) => (l.editable ? { ...l, editable: false } : l)),
    incomes: detail.incomes.map((i) => (i.editable ? { ...i, editable: false } : i)),
  };
}
