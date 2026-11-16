import { z } from 'zod';

export const Locale = z.enum(['fr', 'en']);
export type Locale = z.infer<typeof Locale>;

/** ISO 4217 code, 3 uppercase letters. */
export const CurrencyCode = z.string().regex(/^[A-Z]{3}$/, 'ISO 4217 code, 3 uppercase letters');

/** Preset avatars (spec Assumptions: no photo upload). `initials` shows the first letter. */
export const AVATAR_KEYS = ['initials', 'leaf', 'sun', 'moon', 'star', 'heart', 'coffee', 'house'] as const;
export const AvatarKey = z.enum(AVATAR_KEYS);
export type AvatarKey = z.infer<typeof AvatarKey>;

/** Preset colors; each maps to a design token in the app. */
export const COLOR_KEYS = ['blue', 'green', 'orange', 'purple', 'pink', 'teal', 'red', 'yellow'] as const;
export const ColorKey = z.enum(COLOR_KEYS);
export type ColorKey = z.infer<typeof ColorKey>;

export const Platform = z.enum(['ios', 'android', 'web']);

export const DeviceInfo = z.object({
  deviceName: z.string().trim().min(1).max(100),
  platform: Platform,
});
export type DeviceInfo = z.infer<typeof DeviceInfo>;

export const Tokens = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshToken: z.string(),
});
export type Tokens = z.infer<typeof Tokens>;

export const SignInMethod = z.enum(['password', 'apple', 'google']);

export const Me = z.object({
  id: z.uuid(),
  email: z.string(),
  emailConfirmed: z.boolean(),
  firstName: z.string(),
  avatarKey: AvatarKey,
  colorKey: ColorKey,
  locale: Locale,
  currency: CurrencyCode,
  signInMethods: z.array(SignInMethod),
  status: z.enum(['active', 'pending_deletion']),
  deletionScheduledAt: z.iso.datetime().nullable(),
  hasBudget: z.boolean(),
});
export type Me = z.infer<typeof Me>;

export const AuthResult = z.object({ tokens: Tokens, me: Me });
export type AuthResult = z.infer<typeof AuthResult>;
