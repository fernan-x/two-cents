import { type AppLockSettings, shouldLock } from '@two-cents/shared/domain';

export type AppStateStatus = 'active' | 'background' | 'inactive' | 'unknown' | 'extension';

/**
 * Decides when to lock (FR-036): on cold start, and when coming back after more than 30 s in background.
 * Pure logic, wired to React Native's AppState by `useAppLock`.
 */
export function createLockController(deps: {
  getSettings: () => Promise<AppLockSettings>;
  now: () => Date;
  lock: () => void;
}) {
  let backgroundedAt: Date | null = null;

  return {
    async onColdStart(): Promise<void> {
      if (shouldLock({ coldStart: true, backgroundedAt: null, now: deps.now(), settings: await deps.getSettings() })) deps.lock();
    },
    async onAppStateChange(state: AppStateStatus): Promise<void> {
      if (state === 'background') {
        backgroundedAt = deps.now();
        return;
      }
      if (state !== 'active') return;
      const since = backgroundedAt;
      backgroundedAt = null;
      if (shouldLock({ coldStart: false, backgroundedAt: since, now: deps.now(), settings: await deps.getSettings() })) deps.lock();
    },
  };
}
