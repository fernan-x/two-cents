import { GoogleSignin, isErrorWithCode, isSuccessResponse, statusCodes } from '@react-native-google-signin/google-signin';
import { useEffect } from 'react';

import { config } from '@/config';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  // The backend verifies the ID token against the web client ID (research R9).
  GoogleSignin.configure({ webClientId: config.googleWebClientId, iosClientId: config.googleIosClientId || undefined });
  configured = true;
}

/** Native Google sign-in. Returns the ID token, or null when the user cancels. */
export function useGoogleSignIn() {
  useEffect(ensureConfigured, []);

  async function signIn(): Promise<string | null> {
    ensureConfigured();
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      if (!isSuccessResponse(response)) return null;
      return response.data.idToken;
    } catch (error) {
      if (isErrorWithCode(error) && error.code === statusCodes.IN_PROGRESS) return null;
      throw error;
    }
  }

  return { available: Boolean(config.googleWebClientId), signIn };
}
