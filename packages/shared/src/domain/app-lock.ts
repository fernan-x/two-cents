export const APP_LOCK_GRACE_MS = 30_000;

export interface AppLockSettings {
  biometricEnabled: boolean;
  requireOnEveryOpen: boolean;
}

/** Lock on cold start, or after more than 30 s in background, when "require on every open" is on (spec FR-036). */
export function shouldLock(input: {
  coldStart: boolean;
  backgroundedAt: Date | null;
  now: Date;
  settings: AppLockSettings;
}): boolean {
  if (!input.settings.requireOnEveryOpen) return false;
  if (input.coldStart) return true;
  if (input.backgroundedAt === null) return false;
  return input.now.getTime() - input.backgroundedAt.getTime() > APP_LOCK_GRACE_MS;
}
