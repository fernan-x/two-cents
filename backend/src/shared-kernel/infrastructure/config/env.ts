import { z } from 'zod';

const base64Key = (minBytes: number) =>
  z
    .string()
    .min(1)
    .refine((v) => Buffer.from(v, 'base64').length >= minBytes, {
      message: `must be at least ${minBytes} bytes, base64-encoded`,
    });

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url(),
  JWT_SECRET: base64Key(32),
  TOKEN_ENCRYPTION_KEY: base64Key(32),
  IP_HASH_KEY: base64Key(32),
  SMTP_URL: z.string().min(1),
  MAIL_FROM: z.string().min(1),
  APP_LINK_BASE_URL: z.string().min(1),
  APPLE_TEAM_ID: z.string().default(''),
  APPLE_KEY_ID: z.string().default(''),
  APPLE_PRIVATE_KEY: z.string().default(''),
  APPLE_BUNDLE_ID: z.string().default(''),
  GOOGLE_WEB_CLIENT_ID: z.string().default(''),
  /** Comma-separated browser origins allowed to call the API (e.g. the Expo web dev server). Empty = none. */
  CORS_ORIGINS: z.string().default(''),
  /** SHA-256 fingerprint of the Android signing certificate, for App Links. */
  ANDROID_CERT_SHA256: z.string().default(''),
  /** HMAC key for invitation codes: only the HMAC of a code is stored (spec 002 R6). */
  INVITE_CODE_SECRET: z.string().min(32),
  /** Store links on the public invitation page (spec 002 FR-016). */
  APP_STORE_URL: z.string().default('https://apps.apple.com/'),
  PLAY_STORE_URL: z.string().default('https://play.google.com/store/apps'),
  /** Optional Expo access token for push sending (enhanced push security). */
  EXPO_ACCESS_TOKEN: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

/** Parses process.env once; throws at startup when a value is missing or invalid. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const fields = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${fields.join('\n')}`);
  }
  return result.data;
}

export const ENV = Symbol('ENV');
