import { normalize } from './text';

const MONTHS: Array<[number, string[]]> = [
  [1, ['janvier', 'janv', 'january', 'jan']],
  [2, ['fevrier', 'fevr', 'fev', 'february', 'feb']],
  [3, ['mars', 'march', 'mar']],
  [4, ['avril', 'avr', 'april', 'apr']],
  [5, ['mai', 'may']],
  [6, ['juin', 'june', 'jun']],
  [7, ['juillet', 'juil', 'july', 'jul']],
  [8, ['aout', 'august', 'aug']],
  [9, ['septembre', 'sept', 'sep', 'september']],
  [10, ['octobre', 'oct', 'october']],
  [11, ['novembre', 'nov', 'november']],
  [12, ['decembre', 'dec', 'december']],
];

/** "Novembre 2026", "nov. 2026", "November 2026", "11-2026", "2026-11" → { year, month } (US8). */
export function periodFromSheetName(name: string): { year: number; month: number } | null {
  const n = normalize(name);
  const numeric = /^(\d{1,2})[-/. ](\d{4})$/.exec(n) ?? null;
  if (numeric) return valid(Number(numeric[2]), Number(numeric[1]));
  const iso = /^(\d{4})[-/. ](\d{1,2})$/.exec(n);
  if (iso) return valid(Number(iso[1]), Number(iso[2]));
  const year = /(\d{4})/.exec(n);
  if (!year) return null;
  const words = n.replace(/[^a-z ]/g, ' ').split(/\s+/).filter(Boolean);
  for (const [month, names] of MONTHS) if (words.some((w) => names.includes(w))) return valid(Number(year[1]), month);
  return null;
}

function valid(year: number, month: number) {
  return month >= 1 && month <= 12 && year >= 1900 && year <= 2999 ? { year, month } : null;
}
