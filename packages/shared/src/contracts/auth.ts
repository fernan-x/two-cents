import { z } from 'zod';
import { DeviceInfo, Locale, Tokens } from './common';

const Email = z.email().max(254);
/** Length and breach rules are checked server-side (they need the breach list); here only a sane bound. */
const Password = z.string().min(1).max(256);
const FirstNameInput = z.string().max(200).refine((v) => v.trim().length > 0, 'required');

export const SignUpRequest = z.object({
  email: Email,
  password: Password,
  firstName: FirstNameInput,
  locale: Locale,
  device: DeviceInfo,
});
export type SignUpRequest = z.infer<typeof SignUpRequest>;

export const LoginRequest = z.object({ email: z.string().min(1).max(254), password: Password, device: DeviceInfo });
export type LoginRequest = z.infer<typeof LoginRequest>;

export const AppleSignInRequest = z.object({
  identityToken: z.string().min(1),
  authorizationCode: z.string().min(1).optional(),
  firstName: z.string().max(200).optional(),
  locale: Locale,
  device: DeviceInfo,
});
export type AppleSignInRequest = z.infer<typeof AppleSignInRequest>;

export const GoogleSignInRequest = z.object({ idToken: z.string().min(1), locale: Locale, device: DeviceInfo });
export type GoogleSignInRequest = z.infer<typeof GoogleSignInRequest>;

export const LinkPasswordRequest = z.object({ linkToken: z.string().min(1), password: Password, device: DeviceInfo });
export const LinkEmailRequest = z.object({ linkToken: z.string().min(1) });
export const LinkConfirmRequest = z.object({ token: z.string().min(1), device: DeviceInfo });

export const RefreshRequest = z.object({ refreshToken: z.string().min(1) });
export const RefreshResponse = z.object({ tokens: Tokens });

export const ConfirmEmailRequest = z.object({ token: z.string().min(1) });
export const ForgotPasswordRequest = z.object({ email: z.string().min(1).max(254), locale: Locale });
export const ResetPasswordRequest = z.object({ token: z.string().min(1), newPassword: Password });

export const ReauthenticateRequest = z.union([
  z.object({ password: Password }),
  z.object({ provider: z.literal('apple'), identityToken: z.string().min(1) }),
  z.object({ provider: z.literal('google'), idToken: z.string().min(1) }),
]);
export type ReauthenticateRequest = z.infer<typeof ReauthenticateRequest>;
export const ReauthenticateResponse = z.object({ reauthToken: z.string(), expiresAt: z.iso.datetime() });
