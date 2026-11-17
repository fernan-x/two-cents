import { onlineManager } from '@tanstack/react-query';
import type { MonthDetail } from '@two-cents/shared/contracts';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { useSyncExternalStore } from 'react';

const isOnline = (state: NetworkState) => state.isConnected !== false && state.isInternetReachable !== false;

let installed = false;

/**
 * Feeds the device's connectivity to TanStack Query (research R17): offline, queries pause and keep
 * their cached data, so a month stays readable. Safe to call more than once.
 */
export function setupOnlineManager(): void {
  if (installed) return;
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
