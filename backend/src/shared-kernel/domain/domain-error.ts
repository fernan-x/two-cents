import type { ErrorCode, SessionEndReason } from '@two-cents/shared/contracts';

export interface DomainErrorDetails {
  retryAfterSeconds?: number;
  reason?: SessionEndReason;
  linkToken?: string;
  emailHint?: string;
  issues?: Array<{ path: Array<string | number>; message: string }>;
  inviterName?: string;
  invitedEmailMasked?: string;
  budgetId?: string;
  current?: unknown;
  /** Spec 003 (SPLIT_MISMATCH): signed minor units as a string. */
  differenceMinor?: string;
  /** Spec 003 (LINES_NEED_REVIEW). */
  lineIds?: string[];
  /** Spec 003 (IMPORT_INVALID). */
  preview?: unknown;
  /** Overrides the default HTTP status for this code (e.g. ACCOUNT_PENDING_DELETION on sign-up is 409). */
  status?: number;
}

/** Error with a stable code from contracts/api.md. Use cases throw these, never HTTP exceptions. */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details: DomainErrorDetails = {},
  ) {
    super(code);
    this.name = 'DomainError';
  }
}
