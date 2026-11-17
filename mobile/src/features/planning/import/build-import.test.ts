import type { Category } from '@two-cents/shared/contracts';
import { proposeSheetMapping } from '@two-cents/shared/domain';

import {
  blockingRows,
  buildImportRequest,
  importBlocker,
  periodStartFor,
  type SheetState,
} from './build-import';

const M = '00000000-0000-7000-8000-00000000000a';
const F = '00000000-0000-7000-8000-00000000000b';
const members = [
  { membershipId: M, firstName: 'Maëlle' },
  { membershipId: F, firstName: 'Fabien' },
];
const categories: Category[] = [
  { id: '00000000-0000-7000-8000-0000000000c1', systemKey: 'housing', name: null, position: 0 },
  { id: '00000000-0000-7000-8000-0000000000c2', systemKey: 'subscriptions', name: null, position: 1 },
];

function state(withBadRow = true): SheetState {
  const grid = [
    ['Budget', 'Maëlle', 'Fabien'],
    ['Revenus', null, null],
    ['Salaire', 2000, 2990],
    ['DI', null, null],
    ['Spotify', '12,5', null],
    ['DCR', null, null],
    ['Loyer', 950, 950],
    ...(withBadRow ? [['Ponceuse', 'douze', null]] : []),
    ['Reste', 144.26, 158.16],
  ];
  return {
    sheet: proposeSheetMapping('Novembre 2026', grid, members),
    periodStart: '2026-11-01',
    skipped: false,
    edits: {},
  };
}

describe('periodStartFor (research R1)', () => {
  it('start day 1 gives the first of the month', () => {
    expect(periodStartFor({ year: 2026, month: 11 }, 1)).toBe('2026-11-01');
  });
  it('a late start day belongs to the previous calendar month', () => {
    expect(periodStartFor({ year: 2026, month: 11 }, 28)).toBe('2026-10-28');
    expect(periodStartFor({ year: 2027, month: 1 }, 28)).toBe('2026-12-28');
  });
  it('an early start day stays in the month', () => {
    expect(periodStartFor({ year: 2026, month: 11 }, 2)).toBe('2026-11-02');
  });
});

describe('import preview logic (US8, FR-040, FR-041)', () => {
  it('a row with an unreadable amount blocks the import until fixed or skipped', () => {
    const s = state();
    expect(blockingRows(s, 'EUR').map((r) => r.label)).toEqual(['Ponceuse']);
    expect(importBlocker([s], 'EUR')).toBe('rows');

    const bad = s.sheet.rows.find((r) => r.label === 'Ponceuse')!;
    const fixed: SheetState = { ...s, edits: { [bad.rowIndex]: { amountTexts: { [M]: '12' } } } };
    expect(blockingRows(fixed, 'EUR')).toEqual([]);
    const stillBad: SheetState = { ...s, edits: { [bad.rowIndex]: { amountTexts: { [M]: 'douze' } } } };
    expect(blockingRows(stillBad, 'EUR')).toHaveLength(1);
    const skipped: SheetState = { ...s, edits: { [bad.rowIndex]: { skipped: true } } };
    expect(importBlocker([skipped], 'EUR')).toBeNull();
  });

  it('builds the request: category keys become ids, skipped rows and sheets are left out', () => {
    const s = state();
    const bad = s.sheet.rows.find((r) => r.label === 'Ponceuse')!;
    const ready: SheetState = { ...s, edits: { [bad.rowIndex]: { skipped: true } } };
    const request = buildImportRequest([ready, { ...state(false), skipped: true }], categories, 'EUR');
    expect(request.months).toHaveLength(1);
    const [month] = request.months;
    expect(month.periodStart).toBe('2026-11-01');
    expect(month.incomes).toHaveLength(2);
    expect(month.lines.map((l) => l.label)).toEqual(['Spotify', 'Loyer']);
    expect(month.lines[0]).toEqual({
      group: 'personal',
      kind: 'expense',
      label: 'Spotify',
      ownerMembershipId: M,
      categoryId: categories[1].id,
      amount: { entry: 'total', totalMinor: '1250' },
    });
    expect(month.lines[1]).toMatchObject({ categoryId: categories[0].id, split: { mode: 'custom' } });
    expect(month.lines.some((l) => 'categoryKey' in l)).toBe(false);
  });

  it('applies group, kind and category edits', () => {
    const s = state(false);
    const loyer = s.sheet.rows.find((r) => r.label === 'Loyer')!;
    const edited: SheetState = {
      ...s,
      edits: { [loyer.rowIndex]: { group: 'one_off_shared', kind: 'savings', categoryKey: null } },
    };
    const line = buildImportRequest([edited], categories, 'EUR').months[0].lines.find((l) => l.label === 'Loyer')!;
    expect(line).toMatchObject({ group: 'one_off_shared', kind: 'savings', categoryId: null });
  });

  it('needs a period for every included sheet, and at least one sheet', () => {
    expect(importBlocker([{ ...state(false), periodStart: null }], 'EUR')).toBe('period');
    expect(importBlocker([{ ...state(false), skipped: true }], 'EUR')).toBe('nothing');
  });
});
