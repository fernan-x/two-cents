export type TrackingErrorCode = 'PARTS_MISMATCH' | 'INVALID_PART' | 'ZERO_AMOUNT' | 'AMOUNT_TOO_LARGE' | 'INVALID_PAYMENT_METHOD';

/** A broken tracking rule. The backend maps `code` to its HTTP error (contracts/rest-api.md). */
export class TrackingError extends Error {
  constructor(
    readonly code: TrackingErrorCode,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'TrackingError';
  }
}
