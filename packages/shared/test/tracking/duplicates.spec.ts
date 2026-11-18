import { findDuplicates, importKey } from '../../src/domain/tracking/duplicates';

const existing = [
  { id: 'e1', date: '2026-11-12', amount: 10447n, payerKey: 'member:f', importKey: null },
  { id: 'e2', date: '2026-11-01', amount: 95000n, payerKey: 'joint', importKey: 'joint|2026-11-01|95000|loyer|0' },
];

describe('findDuplicates (FR-042)', () => {
  it('flags same amount and payer within ±3 days, inclusive', () => {
    const r = findDuplicates(
      [
        { rowId: 'r1', date: '2026-11-15', amount: 10447n, payerKey: 'member:f', importKey: 'k1' },
        { rowId: 'r2', date: '2026-11-16', amount: 10447n, payerKey: 'member:f', importKey: 'k2' },
        { rowId: 'r3', date: '2026-11-12', amount: 10447n, payerKey: 'joint', importKey: 'k3' },
      ],
      existing,
    );
    expect(r.get('r1')).toEqual({ duplicateOf: 'e1', alreadyImported: false });
    expect(r.get('r2')).toEqual({ duplicateOf: null, alreadyImported: false });
    expect(r.get('r3')).toEqual({ duplicateOf: null, alreadyImported: false });
  });

  it('matches one existing transaction at most once, the closest date first', () => {
    const r = findDuplicates(
      [
        { rowId: 'a', date: '2026-11-14', amount: 10447n, payerKey: 'member:f', importKey: 'ka' },
        { rowId: 'b', date: '2026-11-12', amount: 10447n, payerKey: 'member:f', importKey: 'kb' },
      ],
      existing,
    );
    expect(r.get('b')?.duplicateOf).toBe('e1');
    expect(r.get('a')?.duplicateOf).toBeNull();
  });

  it('flags rows already imported by key', () => {
    const r = findDuplicates([{ rowId: 'x', date: '2026-11-01', amount: 95000n, payerKey: 'joint', importKey: 'joint|2026-11-01|95000|loyer|0' }], existing);
    expect(r.get('x')).toEqual({ duplicateOf: 'e2', alreadyImported: true });
  });
});

describe('importKey', () => {
  it('is stable and distinguishes identical purchases by occurrence index', () => {
    const a = importKey('member:f', '2026-11-12', -10447n, 'CB LECLERC 12/11', 0);
    expect(importKey('member:f', '2026-11-12', -10447n, 'cb  leclerc 12/11', 0)).toBe(a);
    expect(importKey('member:f', '2026-11-12', -10447n, 'CB LECLERC 12/11', 1)).not.toBe(a);
    expect(importKey('joint', '2026-11-12', -10447n, 'CB LECLERC 12/11', 0)).not.toBe(a);
  });
});
