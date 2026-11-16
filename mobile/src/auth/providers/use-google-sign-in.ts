import { useEffect } from 'react';
import { Platform, TurboModuleRegistry } from 'react-native';

import { config } from '@/config';

type GoogleSignInModule = typeof import('@react-native-google-signin/google-signin');

let googleModule: GoogleSignInModule | null | undefined;

/**
 * Loads Google sign-in only when its native module is in the binary.
 * Expo Go (and builds without the config plugin) don't have it: the button is hidden instead of crashing the app.
 */
function loadGoogleSignIn(): GoogleSignInModule | null {
  if (googleModule !== undefined) return googleModule;
  googleModule = null;
  // Native only: there is no TurboModuleRegistry on web.
  if (Platform.OS !== 'web' && TurboModuleRegistry?.get?.('RNGoogleSignin')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    googleModule = require('@react-native-google-signin/google-signin') as GoogleSignInModule;
    // The backend verifies the ID token against the web client ID (research R9).
    googleModule.GoogleSignin.configure({
      webClientId: config.googleWebClientId,
      iosClientId: config.googleIosClientId || undefined,
    });
  }
  return googleModule;
}

/** Native Google sign-in. Returns the ID token, or null when the user cancels. */
export function useGoogleSignIn() {
  useEffect(() => {
    loadGoogleSignIn();
  }, []);

  async function signIn(): Promise<string | null> {
    const google = loadGoogleSignIn();
    if (!google) return null;
    try {
      await google.GoogleSignin.hasPlayServices();
      const response = await google.GoogleSignin.signIn();
      if (!google.isSuccessResponse(response)) return null;
      return response.data.idToken;
    } catch (error) {
      if (google.isErrorWithCode(error) && error.code === google.statusCodes.IN_PROGRESS) return null;
      throw error;
    }
  }

  return { available: Boolean(config.googleWebClientId) && loadGoogleSignIn() !== null, signIn };
}
