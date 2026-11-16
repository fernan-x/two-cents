import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

export interface AppleCredential {
  identityToken: string;
  authorizationCode?: string;
  /** Only sent by Apple on the very first sign-in. */
  firstName?: string;
}

/** Sign in with Apple, iOS only (spec Assumptions). Returns null when the user cancels. */
export function useAppleSignIn() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setAvailable);
  }, []);

  async function signIn(): Promise<AppleCredential | null> {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) return null;
      return {
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode ?? undefined,
        firstName: credential.fullName?.givenName ?? undefined,
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
      throw error;
    }
  }

  return { available, signIn };
}
