import * as XLSX from 'xlsx';
import { cellAmount, periodFromSheetName, proposeSheetMapping, toImportMonth } from '../../src/domain/import';
import { grids, workbookBytes } from '../fixtures/build-spreadsheet';

const M = 'maelle-id';
const F = 'fabien-id';
const members = [
  { membershipId: M, firstName: 'Maëlle' },
  { membershipId: F, firstName: 'Fabien' },
];

describe('periodFromSheetName (US8)', () => {
  it.each([
    ['Novembre 2026', 2026, 11],
    ['nov. 2026', 2026, 11],
    ['November 2026', 2026, 11],
    ['11-2026', 2026, 11],
    ['2026-11', 2026, 11],
    ['  Février 2027 ', 2027, 2],
    ['fevrier 2027', 2027, 2],
    ['Août 2026', 2026, 8],
  ])('%s', (name, year, month) => {
    expect(periodFromSheetName(name)).toEqual({ year, month });
  });

  it('returns null when there is no month', () => {
    expect(periodFromSheetName('Feuil1')).toBeNull();
    expect(periodFromSheetName('Budget')).toBeNull();
  });
});

describe('cellAmount', () => {
  it('reads numbers exactly and text with comma or dot', () => {
    expect(cellAmount(12.5)).toEqual({ amount: 1250n });
    expect(cellAmount(19.99)).toEqual({ amount: 1999n });
    expect(cellAmount(144.26000000000002)).toEqual({ amount: 14426n });
    expect(cellAmount('12,5')).toEqual({ amount: 1250n });
    expect(cellAmount(' 1 234,56 € ')).toEqual({ amount: 123456n });
    expect(cellAmount(null)).toEqual({ amount: null });
    expect(cellAmount('')).toEqual({ amount: null });
  });
  it('flags what it cannot read', () => {
    expect(cellAmount('douze')).toEqual({ amount: null, issue: 'unreadable_amount' });
    expect(cellAmount(12.345)).toEqual({ amount: null, issue: 'unreadable_amount' });
    expect(cellAmount(-5)).toEqual({ amount: null, issue: 'unreadable_amount' });
  });
});

describe('proposeSheetMapping (US8)', () => {
  const sheet = proposeSheetMapping('Novembre 2026', grids()['Novembre 2026'], members);

  it('finds the period and the member columns by first name', () => {
    expect(sheet.period).toEqual({ year: 2026, month: 11 });
    expect(sheet.memberColumns).toEqual({ [M]: 1, [F]: 2 });
  });

  it('reads incomes, flagging meal vouchers as not counted', () => {
    expect(sheet.incomes).toEqual([
      { membershipId: M, label: 'Salaire', amount: 200000n, counts: true, rowIndex: 2 },
      { membershipId: F, label: 'Salaire', amount: 299000n, counts: true, rowIndex: 2 },
      { membershipId: F, label: 'Swile', amount: 16000n, counts: false, rowIndex: 3 },
    ]);
  });

  it('maps rows to groups by section, savings by keyword, and reads "12,5" text', () => {
    const byLabel = Object.fromEntries(sheet.rows.map((r) => [r.label, r]));
    expect(byLabel['Spotify']).toMatchObject({ group: 'personal', kind: 'expense', amounts: { [M]: 1250n, [F]: null } });
    expect(byLabel['Livret A']).toMatchObject({ group: 'personal', kind: 'savings', categoryKey: 'savings' });
    expect(byLabel['Loyer']).toMatchObject({ group: 'recurring_shared', categoryKey: 'housing' });
    expect(byLabel['Épargne commune']).toMatchObject({ kind: 'savings' });
    expect(byLabel['Cadeaux de Noël']).toMatchObject({ group: 'one_off_shared', categoryKey: 'gifts' });
    expect(byLabel['Courses'].categoryKey).toBe('food');
  });

  it('flags the unreadable amount and keeps totals out of the lines', () => {
    const bad = sheet.rows.find((r) => r.label === 'Ponceuse')!;
    expect(bad.issues).toEqual(['unreadable_amount']);
    expect(sheet.rows.some((r) => /total|reste/i.test(r.label))).toBe(false);
    expect(sheet.sheetTotals.whatsLeft).toEqual({ [M]: 14426n, [F]: 15816n });
  });

  it('turns the mapping into one import month: one personal line per member and amount', () => {
    const good = proposeSheetMapping('Octobre 2026', grids()['Octobre 2026'], members);
    const month = toImportMonth(good, '2026-10-01', new Set());
    expect(month.incomes).toHaveLength(3);
    const personal = month.lines.filter((l) => l.group === 'personal');
    expect(personal).toHaveLength(10);
    expect(personal.find((l) => l.label === 'Spotify')).toEqual({
      group: 'personal',
      kind: 'expense',
      label: 'Spotify',
      categoryKey: 'subscriptions',
      ownerMembershipId: M,
      amount: { entry: 'total', totalMinor: '1250' },
    });
    const loyer = month.lines.find((l) => l.label === 'Loyer')!;
    expect(loyer).toMatchObject({
      group: 'recurring_shared',
      split: { mode: 'custom' },
      amount: { entry: 'shares', shares: [{ membershipId: M, amountMinor: '95000' }, { membershipId: F, amountMinor: '95000' }] },
    });
  });

  it('skips rows the person chose to skip', () => {
    const skipRow = sheet.rows.find((r) => r.label === 'Ponceuse')!.rowIndex;
    const month = toImportMonth(sheet, '2026-11-01', new Set([skipRow]));
    expect(month.lines.some((l) => l.label === 'Ponceuse')).toBe(false);
  });
});

describe('real workbook files', () => {
  it.each(['xlsx', 'ods'] as const)('reads a .%s file into the same grids', (type) => {
    const wb = XLSX.read(workbookBytes(type), { type: 'array' });
    expect(wb.SheetNames).toEqual(['Septembre 2026', 'Octobre 2026', 'Novembre 2026']);
    const grid = XLSX.utils.sheet_to_json(wb.Sheets['Novembre 2026'], { header: 1, defval: null, raw: true });
    const sheet = proposeSheetMapping('Novembre 2026', grid as never, members);
    expect(sheet.rows.find((r) => r.label === 'Spotify')!.amounts[M]).toBe(1250n);
  });
});
