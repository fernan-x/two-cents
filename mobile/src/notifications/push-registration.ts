import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { budgetsApi } from '@/features/budgets/api';

// Foreground notifications are shown like background ones (no push on web).
if (Platform.OS !== 'web')
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });

/**
 * Registers this session's Expo push token (spec 002 research R8). With `prompt`, asks for the
 * permission first; it is only asked after creating or joining a budget, never at launch.
 * Best effort: a refusal or a simulator just means no pushes.
 */
export async function registerForPush({ prompt }: { prompt: boolean }): Promise<void> {
  if (Platform.OS === 'web' || !Device.isDevice) return;
  try {
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted && prompt && current.canAskAgain)
      granted = (await Notifications.requestPermissionsAsync()).granted;
    if (!granted) return;
    const projectId =
      (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
      Constants.easConfig?.projectId;
    const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    await budgetsApi.registerPushDevice(data, Platform.OS === 'ios' ? 'ios' : 'android');
  } catch {
    // No pushes on this device; emails still go out.
  }
}

/** Before signing out, so this device stops receiving the account's pushes. */
export async function unregisterPush(): Promise<void> {
  try {
    await budgetsApi.unregisterPushDevice();
  } catch {
    // The session ends anyway; the server also ignores revoked sessions' tokens.
  }
}
