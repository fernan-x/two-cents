import { proposeSheetMapping } from '@two-cents/shared/domain';
import * as XLSX from 'xlsx';
import { isAccepted, parseWorkbook } from './read-workbook';

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

function bytes(bookType: 'xlsx' | 'ods'): Uint8Array {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ['Budget', 'Maëlle', 'Fabien'],
      ['DI', null, null],
      ['Spotify', '12,5', null],
      ['DCR', null, null],
      ['Loyer', 950, 950],
      ['Reste', 144.26, 158.16],
    ]),
    'Novembre 2026',
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Octobre 2026');
  return XLSX.write(wb, { type: 'array', bookType }) as Uint8Array;
}

describe('read-workbook (US8)', () => {
  it('accepts .xlsx and .ods only', () => {
    expect(isAccepted('Budget 2026.xlsx')).toBe(true);
    expect(isAccepted('budget.ODS')).toBe(true);
    expect(isAccepted('budget.csv')).toBe(false);
    expect(isAccepted('budget.numbers')).toBe(false);
  });

  it.each(['xlsx', 'ods'] as const)('reads every sheet of a .%s file, keeping text amounts as text', (type) => {
    const wb = parseWorkbook(`budget.${type}`, bytes(type));
    expect(wb.sheets.map((s) => s.name)).toEqual(['Novembre 2026', 'Octobre 2026']);
    const sheet = proposeSheetMapping('Novembre 2026', wb.sheets[0].grid, [
      { membershipId: 'm', firstName: 'Maëlle' },
      { membershipId: 'f', firstName: 'Fabien' },
    ]);
    expect(sheet.rows.find((r) => r.label === 'Spotify')?.amounts.m).toBe(1250n);
    expect(sheet.sheetTotals.whatsLeft).toEqual({ m: 14426n, f: 15816n });
  });
});
