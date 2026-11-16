import { strFromU8, unzipSync } from 'fflate';
import { toCsv, ZipExportBuilder } from './zip-export-builder';

describe('export archive', () => {
  it('writes RFC 4180 CSV with a BOM and escaped quotes', () => {
    expect(toCsv([{ name: 'Maëlle "M"', amountMinor: 143642 }])).toBe(
      '﻿"name","amountMinor"\r\n"Maëlle ""M""","143642"\r\n',
    );
  });

  it('zips export.json and one CSV per section', () => {
    const zip = new ZipExportBuilder().build({
      exportedAt: '2026-11-16T10:00:00.000Z',
      profile: { firstName: 'Maëlle' },
      signInMethods: [],
      sessions: [],
      budgets: [],
      entries: [],
    });
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual([
      'budgets.csv',
      'entries.csv',
      'export.json',
      'profile.csv',
      'sessions.csv',
      'sign-in-methods.csv',
    ]);
    expect(JSON.parse(strFromU8(files['export.json'])).profile.firstName).toBe(
      'Maëlle',
    );
  });
});
