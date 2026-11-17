export type PlanningErrorCode =
  | 'SPLIT_MISMATCH'
  | 'NO_INCOME_FOR_PROPORTIONAL'
  | 'UNKNOWN_MEMBER'
  | 'TOTAL_REQUIRED'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_TOO_LARGE'
  | 'INVALID_FORMULA'
  | 'INVALID_TRANSITION'
  | 'SUB_ITEMS_EXCEED_TOTAL';

/** A broken planning rule. The backend maps `code` to its HTTP error (contracts/rest-api.md). */
export class PlanningError extends Error {
  constructor(
    readonly code: PlanningErrorCode,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'PlanningError';
  }
}
