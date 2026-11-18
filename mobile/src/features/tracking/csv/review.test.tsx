import type { LineView, TransactionHints } from '@two-cents/shared/contracts';
import type { CsvRow } from '@two-cents/shared/domain';

import { applyDryRun, buildReviewRows, canConfirm, toRequestRows } from './import-model';

let n = 0;
const newId = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
const lines = [{ id: 'courses', seriesId: 's-courses', group: 'recurring_shared', ownerMembershipId: null }] as LineView[];
const hints: TransactionHints = {
  windowDays: 90,
  labels: [{ normalizedLabel: 'leclerc', seriesId: 's-courses', count: 2, lastUsedAt: '2026-11-01T00:00:00.000Z' }],
  mostUsed: [],
  lastMethodByPayer: [],
};
const csv: CsvRow[] = [
  { index: 0, date: '2026-11-12', direction: 'debit', amountMinor: 10447n, label: 'CB LECLERC 12/11', error: null },
  { index: 1, date: '2026-11-14', direction: 'credit', amountMinor: 2500n, label: 'REMB AMAZON', error: null },
  { index: 2, date: null, direction: 'debit', amountMinor: 100n, label: 'BAD', error: 'UNREADABLE_DATE' },
  { index: 3, date: '2026-11-12', direction: 'debit', amountMinor: 10447n, label: 'CB LECLERC 12/11', error: null },
];

describe('CSV review model (US9, FR-041–FR-043)', () => {
  const rows = buildReviewRows(csv, { payerKey: 'joint', lines, hints, newId });

  it('includes debits as expenses, proposes credits as unchecked refunds, suggests lines from bank labels', () => {
    expect(rows.map((r) => [r.include, r.amountMinor, r.lineId])).toEqual([
      [true, '10447', 'courses'],
      [false, '-2500', null],
      [false, '100', null],
      [true, '10447', 'courses'],
    ]);
  });

  it('gives two identical purchases different import keys', () => {
    expect(rows[0].importKey).not.toBe(rows[3].importKey);
  });

  it('unchecks duplicates after the dry run and blocks confirming unreadable rows', () => {
    const after = applyDryRun(rows, {
      rows: [
        { rowId: rows[0].rowId, duplicateOf: '00000000-0000-7000-8000-0000000000ff', alreadyImported: false, monthStatus: 'open', error: null },
        { rowId: rows[3].rowId, duplicateOf: null, alreadyImported: false, monthStatus: 'open', error: null },
      ],
    });
    expect(after[0]).toMatchObject({ include: false, duplicateOf: '00000000-0000-7000-8000-0000000000ff' });
    expect(after[3].include).toBe(true);
    expect(canConfirm(after)).toBe(true);
    expect(canConfirm(after.map((r, i) => (i === 2 ? { ...r, include: true } : r)))).toBe(false);
  });

  it('sends readable rows only, with their line as one part', () => {
    const out = toRequestRows(rows);
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ amountMinor: '10447', parts: [{ lineId: 'courses', amountMinor: '10447' }], isPlanned: true });
  });

  it('saves nothing until confirm: the model only builds requests', () => {
    expect(toRequestRows([])).toEqual([]);
  });
});
