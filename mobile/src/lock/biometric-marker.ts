import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const MARKER_KEY = 'biometric_marker';

export type UnlockResult = 'success' | 'failed' | 'fallbackRequired';

/**
 * Biometric unlock built on a secure-store item that only biometrics can read (research R11).
 * The OS invalidates it when biometric enrolment changes, which turns biometric unlock off (FR-038).
 * The device passcode is never accepted (FR-037).
 */
export const biometricMarker = {
  async isAvailable(): Promise<boolean> {
    const [hardware, enrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);
    return hardware && enrolled && SecureStore.canUseBiometricAuthentication();
  },

  /** Writes the marker, then reads it once so enabling requires a successful biometric check. */
  async enable(prompt: string): Promise<boolean> {
    const value = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(MARKER_KEY, value, { requireAuthentication: true, authenticationPrompt: prompt });
    return (await this.unlock(prompt)) === 'success';
  },

  async unlock(prompt: string): Promise<UnlockResult> {
    try {
      const value = await SecureStore.getItemAsync(MARKER_KEY, { requireAuthentication: true, authenticationPrompt: prompt });
      if (value === null) {
        // Enrolment changed (or marker missing): biometric unlock must be re-enabled.
        await this.disable();
        return 'fallbackRequired';
      }
      return 'success';
    } catch {
      return 'failed';
    }
  },

  async disable(): Promise<void> {
    await SecureStore.deleteItemAsync(MARKER_KEY).catch(() => undefined);
  },
};
