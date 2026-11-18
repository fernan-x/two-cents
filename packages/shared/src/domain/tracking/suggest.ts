import type { Group } from '../planning/types';

/** Lower-case, accents removed, spaces collapsed and trimmed (R6). */
export function normalizeLabel(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const NOISE = [/^(cb|carte|prlv|vir|virement|paiement|achat)$/, /^x?\d{4}$/, /^\d{2}\/\d{2}(\/\d{2,4})?$/, /^x+\d+$/];

/** Bank labels without the payment noise ("CB LECLERC 12/11" → "leclerc", R11). */
export function stripBankNoise(label: string): string {
  return normalizeLabel(label)
    .split(' ')
    .filter((word) => !NOISE.some((re) => re.test(word)))
    .join(' ');
}

export interface HintLabel {
  normalizedLabel: string;
  seriesId: string;
  count: number;
  lastUsedAt: string;
}

export interface MonthLineRef {
  id: string;
  seriesId: string;
  group: Group;
  ownerMembershipId: string | null;
}

/**
 * FR-011: the line of the series most often chosen for this label (ties: most recent), in this
 * month. Null when the label is unknown or the series has no line this month.
 */
export function suggestLine(label: string, labels: readonly HintLabel[], monthLines: readonly MonthLineRef[]): string | null {
  const wanted = normalizeLabel(label);
  if (!wanted) return null;
  let best: HintLabel | undefined;
  for (const h of labels) {
    if (h.normalizedLabel !== wanted) continue;
    if (!best || h.count > best.count || (h.count === best.count && h.lastUsedAt > best.lastUsedAt)) best = h;
  }
  if (!best) return null;
  return monthLines.find((l) => l.seriesId === best.seriesId)?.id ?? null;
}

/**
 * FR-009: up to `limit` lines for the quick-add chips: most used first, then the other lines of
 * the month in order. Never another member's personal line.
 */
export function mostUsedLines(
  mostUsed: readonly { seriesId: string; count: number }[],
  monthLines: readonly MonthLineRef[],
  me: string,
  limit = 6,
): string[] {
  const usable = monthLines.filter((l) => l.group !== 'personal' || l.ownerMembershipId === me);
  const ranked = [...mostUsed].sort((a, b) => b.count - a.count);
  const out: string[] = [];
  for (const u of ranked) {
    const line = usable.find((l) => l.seriesId === u.seriesId);
    if (line && !out.includes(line.id)) out.push(line.id);
  }
  for (const l of usable) if (!out.includes(l.id)) out.push(l.id);
  return out.slice(0, limit);
}
