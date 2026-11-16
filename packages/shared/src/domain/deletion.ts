export const DELETION_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** Permanent deletion happens exactly 7 × 24 h after the request (spec FR-041a). */
export function computeDeletionDate(requestedAt: Date): Date {
  return new Date(requestedAt.getTime() + DELETION_GRACE_MS);
}
