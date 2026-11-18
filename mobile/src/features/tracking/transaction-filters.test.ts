import type { FullTransactionView, LineView } from '@two-cents/shared/contracts';

import type { LocalTransaction } from './mutations';
import { byDay, filterTransactions } from './transaction-filters';

const F = 'f';
const M = 'm';
const lines = [
  { id: 'courses', group: 'recurring_shared', ownerMembershipId: null },
  { id: 'maison', group: 'one_off_shared', ownerMembershipId: null },
  { id: 'phone', group: 'personal', ownerMembershipId: F },
] as LineView[];

let n = 0;
const tx = (over: Partial<FullTransactionView> & { _pending?: true } = {}): LocalTransaction =>
  ({
    private: false,
    id: `t${n++}`,
    date: '2026-11-10',
    amountMinor: '1000',
    label: 'Leclerc',
    payer: { kind: 'joint' },
    isPlanned: true,
    parts: [],
    ...over,
  }) as LocalTransaction;

const rows = [
  tx({ label: 'Total Énergies', parts: [{ id: 'p', lineId: 'courses', subItemId: null, amountMinor: '1000', needsReview: false }] }),
  tx({ label: 'Leclerc', amountMinor: '2000', payer: { kind: 'member', membershipId: M }, parts: [{ id: 'p', lineId: 'maison', subItemId: null, amountMinor: '2000', needsReview: false }] }),
  tx({ label: 'Free', amountMinor: '1999', date: '2026-11-12', payer: { kind: 'member', membershipId: F }, parts: [{ id: 'p', lineId: 'phone', subItemId: null, amountMinor: '1999', needsReview: false }] }),
  tx({ label: 'Boulangerie', amountMinor: '-300', isPlanned: false, _pending: true }),
  { private: true, id: 'secret', monthStart: '2026-11-01', date: '2026-11-11', ownerMembershipId: M } as LocalTransaction,
];

describe('filterTransactions (FR-017)', () => {
  it('lists everything with the total of visible amounts', () => {
    expect(filterTransactions(rows, lines, {})).toMatchObject({ totalMinor: '4699' });
  });

  it('combines payer, group and label search, ignoring case and accents', () => {
    const r = filterTransactions(rows, lines, { payer: 'joint', group: 'recurring_shared', search: 'total energies' });
    expect(r.rows.map((x) => x.id)).toEqual([rows[0].id]);
    expect(r.totalMinor).toBe('1000');
  });

  it('filters by member involved (payer or personal line owner), planned flag and pending rows', () => {
    expect(filterTransactions(rows, lines, { member: F }).rows.map((x) => x.id)).toEqual([rows[2].id]);
    expect(filterTransactions(rows, lines, { planned: false }).rows.map((x) => x.id)).toEqual([rows[3].id]);
    expect(filterTransactions(rows, lines, { pendingOnly: true }).rows.map((x) => x.id)).toEqual([rows[3].id]);
    expect(filterTransactions(rows, lines, { group: 'unassigned' }).rows.map((x) => x.id)).toEqual([rows[3].id]);
  });

  it('keeps private stubs only without filters that need their details', () => {
    expect(filterTransactions(rows, lines, {}).rows.map((r) => r.id)).toContain('secret');
    expect(filterTransactions(rows, lines, { search: 'x' }).rows.map((r) => r.id)).not.toContain('secret');
  });
});

describe('byDay', () => {
  it('groups by date, newest first', () => {
    expect(byDay(rows).map((d) => d.date)).toEqual(['2026-11-12', '2026-11-11', '2026-11-10']);
  });
});
