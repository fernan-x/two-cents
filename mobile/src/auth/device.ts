import type { DeviceInfo } from '@two-cents/shared/contracts';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

/** Sent with every sign-in so the sessions list can name devices (FR-022). */
export function currentDevice(): DeviceInfo {
  const name = Device.deviceName?.trim() || Device.modelName || (Platform.OS === 'ios' ? 'iPhone' : 'Android');
  return {
    deviceName: name.slice(0, 100),
    platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
  };
}
