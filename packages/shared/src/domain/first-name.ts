export const FIRST_NAME_MAX_LENGTH = 50;

export type FirstNameResult = { ok: true; value: string } | { ok: false };

/** NFC-normalized, trimmed, 1–50 code points, any script (spec FR-039). */
export function validateFirstName(raw: string): FirstNameResult {
  const value = raw.normalize('NFC').trim();
  const length = Array.from(value).length;
  return length >= 1 && length <= FIRST_NAME_MAX_LENGTH ? { ok: true, value } : { ok: false };
}
