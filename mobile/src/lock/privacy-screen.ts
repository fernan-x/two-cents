import * as ScreenCapture from 'expo-screen-capture';
import { Platform } from 'react-native';

/** Hides financial data in the app switcher while "require on every open" is on (FR-036). */
export async function applyPrivacyScreen(enabled: boolean): Promise<void> {
  try {
    if (Platform.OS === 'ios') {
      if (enabled) await ScreenCapture.enableAppSwitcherProtectionAsync(0.9);
      else await ScreenCapture.disableAppSwitcherProtectionAsync();
    } else if (Platform.OS === 'android') {
      if (enabled) await ScreenCapture.preventScreenCaptureAsync('app-lock');
      else await ScreenCapture.allowScreenCaptureAsync('app-lock');
    }
  } catch {
    // Not supported on this platform/build: the lock screen still protects the content.
  }
}
