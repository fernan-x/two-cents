/** Canonical form used for uniqueness: emails are case-insensitive (spec FR-003). */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
