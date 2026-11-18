import { Injectable } from '@nestjs/common';
import { strToU8, zipSync } from 'fflate';
import type {
  ExportArchiveBuilder,
  ExportRow,
  UserExport,
} from '../../application/ports/export';

const BOM = '﻿';

/** RFC 4180: quote every field, double inner quotes, CRLF line endings. */
export function toCsv(rows: ExportRow[]): string {
  if (rows.length === 0) return BOM;
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v: ExportRow[string] | undefined) =>
    `"${v === null || v === undefined ? '' : String(v).replace(/"/g, '""')}"`;
  const lines = [
    headers.map(cell).join(','),
    ...rows.map((r) => headers.map((h) => cell(r[h])).join(',')),
  ];
  // The BOM makes Excel read UTF-8 accents correctly.
  return BOM + lines.join('\r\n') + '\r\n';
}

@Injectable()
export class ZipExportBuilder implements ExportArchiveBuilder {
  build(data: UserExport): Uint8Array {
    const { files = [], sections = {}, ...json } = data;
    const extra: Record<string, Uint8Array> = {};
    for (const [name, rows] of Object.entries(sections))
      extra[`${name}.csv`] = strToU8(toCsv(rows));
    for (const f of files) extra[f.path] = f.bytes;
    return zipSync({
      ...extra,
      'export.json': strToU8(JSON.stringify({ ...json, ...sections }, null, 2)),
      'profile.csv': strToU8(toCsv([data.profile])),
      'sign-in-methods.csv': strToU8(toCsv(data.signInMethods)),
      'sessions.csv': strToU8(toCsv(data.sessions)),
      'budgets.csv': strToU8(toCsv(data.budgets)),
      'entries.csv': strToU8(toCsv(data.entries)),
    });
  }
}
