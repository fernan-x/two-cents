import * as SecureStore from 'expo-secure-store';

// Secrets live only in the Keychain / Keystore, never in AsyncStorage (constitution Principle III).
const REFRESH_TOKEN = 'refresh_token';
const LOCK_SETTINGS = 'lock_settings';

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface LockSettings {
  biometricEnabled: boolean;
  requireOnEveryOpen: boolean;
}

export const secureStorage = {
  getRefreshToken: () => SecureStore.getItemAsync(REFRESH_TOKEN, options),
  setRefreshToken: (token: string) => SecureStore.setItemAsync(REFRESH_TOKEN, token, options),
  clearRefreshToken: () => SecureStore.deleteItemAsync(REFRESH_TOKEN, options),

  async getLockSettings(): Promise<LockSettings> {
    const raw = await SecureStore.getItemAsync(LOCK_SETTINGS, options);
    if (!raw) return { biometricEnabled: false, requireOnEveryOpen: false };
    try {
      return JSON.parse(raw) as LockSettings;
    } catch {
      return { biometricEnabled: false, requireOnEveryOpen: false };
    }
  },
  setLockSettings: (settings: LockSettings) =>
    SecureStore.setItemAsync(LOCK_SETTINGS, JSON.stringify(settings), options),
  clearLockSettings: () => SecureStore.deleteItemAsync(LOCK_SETTINGS, options),
};
