/** Verified claims from an Apple or Google identity token (research R8/R9). */
export interface ProviderClaims {
  subject: string;
  email: string | null;
  emailVerified: boolean;
  isPrivateRelay: boolean;
  givenName: string | null;
}

export interface ProviderIdentityVerifier {
  /** Verifies signature, issuer, audience and expiry; null when the token is not valid. */
  verify(token: string): Promise<ProviderClaims | null>;
}
export const APPLE_IDENTITY_VERIFIER = Symbol('AppleIdentityVerifier');
export const GOOGLE_IDENTITY_VERIFIER = Symbol('GoogleIdentityVerifier');

export interface AppleCodeExchanger {
  /** Exchanges the authorization code for an Apple refresh token (kept encrypted, revoked on deletion). */
  exchange(authorizationCode: string): Promise<string | null>;
  revoke(refreshToken: string): Promise<void>;
}
export const APPLE_CODE_EXCHANGER = Symbol('AppleCodeExchanger');

export type AppleNotificationType =
  'email-disabled' | 'email-enabled' | 'consent-revoked' | 'account-delete';

export interface AppleNotificationVerifier {
  /** Verifies Apple's signed notification JWT; null when invalid or of an unknown type. */
  verifyNotification(
    payload: string,
  ): Promise<{ type: AppleNotificationType; subject: string } | null>;
}
export const APPLE_NOTIFICATION_VERIFIER = Symbol('AppleNotificationVerifier');
