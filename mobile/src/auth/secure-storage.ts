import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Secrets live only in the Keychain / Keystore, never in AsyncStorage (constitution Principle III).
const REFRESH_TOKEN = 'refresh_token';
const LOCK_SETTINGS = 'lock_settings';
const PENDING_INVITE = 'pending_invite_code';

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export interface LockSettings {
  biometricEnabled: boolean;
  requireOnEveryOpen: boolean;
}

/**
 * The web has no Keychain/Keystore. Rather than put tokens in localStorage, web keeps them in memory:
 * the session is lost on reload, which is acceptable for a development preview.
 */
const memory = new Map<string, string>();
const store =
  Platform.OS === 'web'
    ? {
        getItemAsync: (key: string) => Promise.resolve(memory.get(key) ?? null),
        setItemAsync: (key: string, value: string) => Promise.resolve(void memory.set(key, value)),
        deleteItemAsync: (key: string) => Promise.resolve(void memory.delete(key)),
      }
    : {
        getItemAsync: (key: string) => SecureStore.getItemAsync(key, options),
        setItemAsync: (key: string, value: string) => SecureStore.setItemAsync(key, value, options),
        deleteItemAsync: (key: string) => SecureStore.deleteItemAsync(key, options),
      };

export const secureStorage = {
  getRefreshToken: () => store.getItemAsync(REFRESH_TOKEN),
  setRefreshToken: (token: string) => store.setItemAsync(REFRESH_TOKEN, token),
  clearRefreshToken: () => store.deleteItemAsync(REFRESH_TOKEN),

  async getLockSettings(): Promise<LockSettings> {
    const raw = await store.getItemAsync(LOCK_SETTINGS);
    if (!raw) return { biometricEnabled: false, requireOnEveryOpen: false };
    try {
      return JSON.parse(raw) as LockSettings;
    } catch {
      return { biometricEnabled: false, requireOnEveryOpen: false };
    }
  },
  setLockSettings: (settings: LockSettings) => store.setItemAsync(LOCK_SETTINGS, JSON.stringify(settings)),
  clearLockSettings: () => store.deleteItemAsync(LOCK_SETTINGS),

  /** Spec 002 FR-015: an invitation code opened while signed out, kept through sign-up. */
  getPendingInvite: () => store.getItemAsync(PENDING_INVITE),
  setPendingInvite: (code: string) => store.setItemAsync(PENDING_INVITE, code),
  clearPendingInvite: () => store.deleteItemAsync(PENDING_INVITE),
};
