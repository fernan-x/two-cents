import { z } from 'zod';

/** Stable API error codes (contracts/api.md). The app translates them as `errors.<CODE>`. */
export const ErrorCode = z.enum([
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'UNAUTHENTICATED',
  'EMAIL_IN_USE',
  'PASSWORD_TOO_SHORT',
  'PASSWORD_BREACHED',
  'ACCOUNT_PENDING_DELETION',
  'INVALID_CREDENTIALS',
  'ACCOUNT_LOCKED',
  'INVALID_PROVIDER_TOKEN',
  'LINK_REQUIRED',
  'LINK_EXPIRED',
  'SESSION_ENDED',
  'TOKEN_INVALID',
  'ALREADY_CONFIRMED',
  'REAUTH_REQUIRED',
  'CANNOT_REVOKE_CURRENT',
  'NOT_PENDING',
  'NOT_FOUND',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const SessionEndReason = z.enum([
  'logout',
  'revoked_by_user',
  'password_changed',
  'reuse_detected',
  'provider_revoked',
  'account_deletion',
  'expired',
]);
export type SessionEndReason = z.infer<typeof SessionEndReason>;

export const ApiError = z.object({
  error: ErrorCode,
  retryAfterSeconds: z.number().int().nonnegative().optional(),
  issues: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() })).optional(),
  reason: SessionEndReason.optional(),
  linkToken: z.string().optional(),
  emailHint: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
