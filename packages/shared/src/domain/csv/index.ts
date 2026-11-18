import { parseAmount } from '../money';
import { normalizeLabel } from '../tracking/suggest';

/**
 * Bank CSV exports, read on the device (spec 004 research R11). No dependency: a small RFC 4180
 * parser and the Windows-1252 table French banks still use (Hermes decodes UTF-8 only).
 */

export type CsvEncoding = 'utf-8' | 'windows-1252';
export type CsvDelimiter = ';' | ',' | '\t';

/** 0x80–0x9F of Windows-1252; the rest of the byte range matches Latin-1 / Unicode. */
const CP1252_HIGH = [
  0x20ac, 0xfffd, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0xfffd, 0x017d, 0xfffd,
  0xfffd, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0xfffd, 0x017e, 0x0178,
];

/** Strict UTF-8 decoding; null on any invalid sequence. */
function decodeUtf8(bytes: Uint8Array): string | null {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let cp: number;
    let extra: number;
    if (b < 0x80) {
      cp = b;
      extra = 0;
    } else if (b >= 0xc2 && b < 0xe0) {
      cp = b & 0x1f;
      extra = 1;
    } else if (b >= 0xe0 && b < 0xf0) {
      cp = b & 0x0f;
      extra = 2;
    } else if (b >= 0xf0 && b < 0xf5) {
      cp = b & 0x07;
      extra = 3;
    } else return null;
    if (i + extra >= bytes.length && extra > 0) return null;
    for (let k = 1; k <= extra; k++) {
      const c = bytes[i + k];
      if ((c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    if ((extra === 2 && cp < 0x800) || (extra === 3 && (cp < 0x10000 || cp > 0x10ffff)) || (cp >= 0xd800 && cp <= 0xdfff)) return null;
    out += String.fromCodePoint(cp);
    i += extra + 1;
  }
  return out;
}

function decodeCp1252(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += String.fromCharCode(b >= 0x80 && b < 0xa0 ? CP1252_HIGH[b - 0x80] : b);
  return out;
}

/** UTF-8 (BOM dropped) when valid, else Windows-1252. */
export function decodeText(bytes: Uint8Array): { text: string; encoding: CsvEncoding } {
  const body = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? bytes.subarray(3) : bytes;
  const utf8 = decodeUtf8(body);
  return utf8 !== null ? { text: utf8, encoding: 'utf-8' } : { text: decodeCp1252(body), encoding: 'windows-1252' };
}

function splitRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"' && field === '') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** RFC 4180 parsing; the delimiter is the one splitting the first lines most consistently. */
export function parseCsv(text: string, delimiter?: CsvDelimiter): { delimiter: CsvDelimiter; rows: string[][] } {
  const pick =
    delimiter ??
    (([';', ',', '\t'] as const)
      .map((d) => {
        const rows = splitRows(text.slice(0, 4000), d).slice(0, 10);
        const widths = rows.map((r) => r.length);
        const max = Math.max(1, ...widths);
        return { d, score: max > 1 ? widths.filter((w) => w === max).length * max : 0 };
      })
      .sort((a, b) => b.score - a.score)[0].d as CsvDelimiter);
  return {
    delimiter: pick,
    rows: splitRows(text, pick).map((r) => {
      // Trailing empty cells from a trailing delimiter ("a;b;") are dropped.
      while (r.length > 1 && r[r.length - 1] === '') r.pop();
      return r;
    }),
  };
}

export interface CsvMappingShape {
  delimiter: CsvDelimiter;
  encoding: CsvEncoding;
  dateColumn: number;
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD';
  labelColumns: number[];
  amountColumn: number | null;
  debitColumn: number | null;
  creditColumn: number | null;
  skipRows: number;
}

const KEYWORDS = {
  date: /^date( (d'|de l')?(operation|valeur|comptable))?$|^date operation$/,
  label: /^(libelle|label|description|intitule|libelle operation|libelle simplifie|details?)$/,
  amount: /^(montant|amount|montant \(eur\)|montant eur)$/,
  debit: /^(debit|debit eur|debit \(eur\))$/,
  credit: /^(credit|credit eur|credit \(eur\))$/,
};

/** Identifies a bank format by its header row (stored mapping key, FR-040). */
export function headerFingerprint(header: readonly string[]): string {
  return header.map((h) => normalizeLabel(h)).join('|');
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const FR = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function validDate(y: number, m: number, d: number): boolean {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function readDate(value: string, format: CsvMappingShape['dateFormat']): string | null {
  const v = value.trim();
  const match = format === 'YYYY-MM-DD' ? ISO.exec(v) : FR.exec(v);
  if (!match) return null;
  const [y, m, d] = format === 'YYYY-MM-DD' ? [match[1], match[2], match[3]] : [match[3], match[2], match[1]];
  if (!validDate(Number(y), Number(m), Number(d))) return null;
  return `${y}-${m}-${d}`;
}

/** Proposes how to read the file (FR-040): header row in the first 10 rows, ≥ date + label + amount(s). */
export function proposeCsvMapping(rows: readonly string[][], delimiter: CsvDelimiter, encoding: CsvEncoding): CsvMappingShape | null {
  for (let skip = 0; skip < Math.min(10, rows.length); skip++) {
    const header = rows[skip].map((h) => normalizeLabel(h));
    const find = (re: RegExp) => header.findIndex((h) => re.test(h));
    const date = find(KEYWORDS.date);
    const label = find(KEYWORDS.label);
    const amount = find(KEYWORDS.amount);
    const debit = find(KEYWORDS.debit);
    const credit = find(KEYWORDS.credit);
    if (date < 0 || label < 0 || (amount < 0 && debit < 0 && credit < 0)) continue;
    const sample = rows.slice(skip + 1).find((r) => r[date]?.trim());
    const dateFormat = sample && ISO.test(sample[date].trim()) ? 'YYYY-MM-DD' : 'DD/MM/YYYY';
    return {
      delimiter,
      encoding,
      dateColumn: date,
      dateFormat,
      labelColumns: [label],
      amountColumn: amount >= 0 ? amount : null,
      debitColumn: amount >= 0 || debit < 0 ? null : debit,
      creditColumn: amount >= 0 || credit < 0 ? null : credit,
      skipRows: skip,
    };
  }
  return null;
}

export interface CsvRow {
  /** 0-based index among data rows. */
  index: number;
  date: string | null;
  /** Debit = money out (an expense), credit = money in (proposed as a refund, FR-041). */
  direction: 'debit' | 'credit';
  /** Positive cents, or null when unreadable. */
  amountMinor: bigint | null;
  label: string;
  error: 'UNREADABLE_DATE' | 'UNREADABLE_AMOUNT' | null;
}

function readSigned(value: string | undefined, currency: string): bigint | null {
  if (value === undefined) return null;
  const v = value.trim().replace(/€|EUR/gi, '').trim();
  if (!v) return null;
  const negative = v.startsWith('-');
  const abs = parseAmount(v.replace(/^[+-]/, ''), currency);
  if (abs === null) return null;
  return negative ? -abs : abs;
}

/** Data rows read with a mapping; amounts through `parseAmount` (Principle I). */
export function rowsFromCsv(rows: readonly string[][], mapping: CsvMappingShape, currency: string): CsvRow[] {
  return rows.slice(mapping.skipRows + 1).map((r, index) => {
    const date = readDate(r[mapping.dateColumn] ?? '', mapping.dateFormat);
    const label = mapping.labelColumns
      .map((c) => (r[c] ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ');
    let signed: bigint | null;
    if (mapping.amountColumn !== null) signed = readSigned(r[mapping.amountColumn], currency);
    else {
      const debit = mapping.debitColumn !== null ? readSigned(r[mapping.debitColumn], currency) : null;
      const credit = mapping.creditColumn !== null ? readSigned(r[mapping.creditColumn], currency) : null;
      signed = debit !== null && debit !== 0n ? -(debit < 0n ? -debit : debit) : credit;
    }
    const amountMinor = signed === null || signed === 0n ? null : signed < 0n ? -signed : signed;
    const direction = signed !== null && signed > 0n ? 'credit' : 'debit';
    const error = date === null ? 'UNREADABLE_DATE' : amountMinor === null ? 'UNREADABLE_AMOUNT' : null;
    return { index, date, direction, amountMinor, label, error };
  });
}
