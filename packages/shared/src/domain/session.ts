export const SESSION_IDLE_LIMIT_MS = 90 * 24 * 60 * 60 * 1000;

/** A session is active until revoked or unused for more than 90 days (spec FR-021). */
export function isSessionActive(
  session: { revokedAt: Date | null; lastUsedAt: Date },
  now: Date,
): boolean {
  if (session.revokedAt !== null) return false;
  return now.getTime() - session.lastUsedAt.getTime() <= SESSION_IDLE_LIMIT_MS;
}
