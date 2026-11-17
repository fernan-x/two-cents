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
  // Spec 002
  'EMAIL_NOT_CONFIRMED',
  'BUDGET_NOT_FOUND',
  'FORBIDDEN',
  'STALE_STATE',
  'INVALID_BUDGET_NAME',
  'CURRENCY_LOCKED',
  'CONFIRM_NAME_MISMATCH',
  'CANNOT_MODIFY_OWNER',
  'OWNER_MUST_TRANSFER',
  'ALREADY_MEMBER',
  'BUDGET_FULL',
  'INVITATION_NOT_FOUND',
  'INVITATION_WRONG_EMAIL',
  'INVITATION_EXPIRED',
  'INVITATION_REVOKED',
  'INVITATION_DECLINED',
  'INVITATION_USED',
  'INVALID_AMOUNT',
  'INVALID_MONTH',
  // Spec 003
  'MONTH_NOT_FOUND',
  'MONTH_EXISTS',
  'MONTH_CLOSED',
  'INVALID_TRANSITION',
  'LINES_NEED_REVIEW',
  'SPLIT_MISMATCH',
  'NO_INCOME_FOR_PROPORTIONAL',
  'SUB_ITEMS_EXCEED_TOTAL',
  'AMOUNT_TOO_LARGE',
  'SCOPE_REQUIRED',
  'NOT_LINE_OWNER',
  'NOT_INCOME_OWNER',
  'TEMPLATE_NAME_TAKEN',
  'IMPORT_INVALID',
  'UNKNOWN_MEMBER',
  'TOTAL_REQUIRED',
  'INVALID_FORMULA',
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
  /** Spec 002: who sent an invitation that is no longer usable. */
  inviterName: z.string().optional(),
  /** Spec 002: the masked address an invitation was sent to (INVITATION_WRONG_EMAIL). */
  invitedEmailMasked: z.string().optional(),
  /** Spec 002: the budget the caller already belongs to (ALREADY_MEMBER). */
  budgetId: z.string().optional(),
  /** Spec 002: the up-to-date resource on STALE_STATE. */
  current: z.unknown().optional(),
  /** Spec 003: total minus the sum of entered shares, signed minor units (SPLIT_MISMATCH). */
  differenceMinor: z.string().optional(),
  /** Spec 003: lines blocking activation (LINES_NEED_REVIEW). */
  lineIds: z.array(z.string()).optional(),
  /** Spec 003: the import preview explaining IMPORT_INVALID. */
  preview: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;
