import * as SecureStore from 'expo-secure-store';

import { biometricMarker } from './biometric-marker';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(async () => undefined),
  canUseBiometricAuthentication: jest.fn(() => true),
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
}));

const getItem = SecureStore.getItemAsync as jest.Mock;

describe('biometric marker', () => {
  beforeEach(() => jest.clearAllMocks());

  it('unlocks when the marker can be read', async () => {
    getItem.mockResolvedValue('abc');
    expect(await biometricMarker.unlock('Unlock')).toBe('success');
    expect(getItem).toHaveBeenCalledWith('biometric_marker', expect.objectContaining({ requireAuthentication: true }));
  });

  it('disables biometric unlock when enrolment changed (marker reads as null)', async () => {
    getItem.mockResolvedValue(null);
    expect(await biometricMarker.unlock('Unlock')).toBe('fallbackRequired');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('biometric_marker');
  });

  it('reports a failed or cancelled prompt', async () => {
    getItem.mockRejectedValue(new Error('User canceled the operation.'));
    expect(await biometricMarker.unlock('Unlock')).toBe('failed');
  });
});
