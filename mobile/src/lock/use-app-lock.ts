import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/auth/auth-store';
import { secureStorage } from '@/auth/secure-storage';
import { createLockController } from './lock-controller';
import { applyPrivacyScreen } from './privacy-screen';

/** Mounted once in the root layout: locks the app per the user's settings on this device. */
export function useAppLock(): void {
  const auth = useAuth();
  const signedIn = auth.status === 'signedIn' || auth.status === 'locked';
  const lockRef = useRef(auth.lock);
  useEffect(() => {
    lockRef.current = auth.lock;
  });

  useEffect(() => {
    if (!signedIn) return;
    const controller = createLockController({
      getSettings: () => secureStorage.getLockSettings(),
      now: () => new Date(),
      lock: () => lockRef.current(),
    });
    void secureStorage.getLockSettings().then((s) => applyPrivacyScreen(s.requireOnEveryOpen));
    void controller.onColdStart();
    const subscription = AppState.addEventListener('change', (state) => void controller.onAppStateChange(state));
    return () => subscription.remove();
  }, [signedIn]);
}
