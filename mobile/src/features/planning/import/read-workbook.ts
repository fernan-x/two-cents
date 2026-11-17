import type { Grid } from '@two-cents/shared/domain';
import { getDocumentAsync } from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as XLSX from 'xlsx';

/** Spreadsheet formats the import reads (clarification Q2 → .xlsx and .ods only). */
export const ACCEPTED_EXTENSIONS = ['xlsx', 'ods'] as const;
const ACCEPTED_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.spreadsheet',
];

export interface Workbook {
  fileName: string;
  /** Sheet name → cell grid, in the workbook's order. */
  sheets: { name: string; grid: Grid }[];
}

export type ReadResult =
  | { kind: 'cancelled' }
  | { kind: 'unsupported'; fileName: string }
  | { kind: 'unreadable'; fileName: string }
  | { kind: 'ok'; workbook: Workbook };

export function isAccepted(fileName: string): boolean {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext);
}

/**
 * Parses workbook bytes on the device (research R16): the raw file is never uploaded, only the
 * reviewed months are sent. Cells keep their raw values (numbers stay numbers, "12,5" stays text).
 */
export function parseWorkbook(fileName: string, bytes: Uint8Array): Workbook {
  const wb = XLSX.read(bytes, { type: 'array', cellDates: false });
  return {
    fileName,
    sheets: wb.SheetNames.map((name) => ({
      name,
      grid: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: null, raw: true, blankrows: true }) as Grid,
    })),
  };
}

/** Lets the person pick a .xlsx or .ods file and reads it. */
export async function pickWorkbook(): Promise<ReadResult> {
  const result = await getDocumentAsync({ type: ACCEPTED_MIME, copyToCacheDirectory: true, multiple: false });
  if (result.canceled || !result.assets?.[0]) return { kind: 'cancelled' };
  const asset = result.assets[0];
  if (!isAccepted(asset.name)) return { kind: 'unsupported', fileName: asset.name };
  try {
    const bytes = new Uint8Array(await new File(asset.uri).arrayBuffer());
    return { kind: 'ok', workbook: parseWorkbook(asset.name, bytes) };
  } catch {
    return { kind: 'unreadable', fileName: asset.name };
  }
}
