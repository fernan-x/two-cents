import { computeTracking, lineActuals, permille } from '../../src/domain/tracking/actuals';
import type { TrackLine, Tx } from '../../src/domain/tracking/types';

const line = (id: string, planned: bigint, over: Partial<TrackLine> = {}): TrackLine => ({
  id,
  group: 'recurring_shared',
  planned,
  isEnvelope: false,
  ownerMembershipId: null,
  isPrivate: false,
  subItems: [],
  shares: {},
  ...over,
});

let n = 0;
const tx = (amount: bigint, parts: { lineId: string | null; amount?: bigint }[]): Tx => ({
  id: `t${n++}`,
  date: '2026-11-10',
  amount,
  payer: { kind: 'joint' },
  method: 'joint_card',
  isPlanned: true,
  isShared: false,
  parts: parts.map((p) => ({ lineId: p.lineId, subItemId: null, amount: p.amount ?? amount })),
});

describe('permille', () => {
  it('rounds half away from zero, null on zero denominator', () => {
    expect(permille(330n, 400n)).toBe(825);
    expect(permille(1n, 3n)).toBe(333);
    expect(permille(2n, 3n)).toBe(667);
    expect(permille(-1n, 8n)).toBe(-125);
    expect(permille(-1n, 2000n)).toBe(-1); // −0.5‰ → −1
    expect(permille(5n, 0n)).toBeNull();
  });
});

describe('lineActuals', () => {
  it('sums parts per line, refunds subtract, unassigned kept apart', () => {
    const result = lineActuals([
      tx(4230n, [{ lineId: 'courses' }]),
      tx(-2000n, [{ lineId: 'courses' }]),
      tx(-500n, [{ lineId: 'maison' }]),
      tx(999n, []),
      tx(12000n, [
        { lineId: 'courses', amount: 9000n },
        { lineId: 'maison', amount: 3000n },
      ]),
    ]);
    expect(result.byLine.get('courses')).toEqual({ actual: 11230n, txnCount: 3 });
    expect(result.byLine.get('maison')).toEqual({ actual: 2500n, txnCount: 2 });
    expect(result.unassigned).toEqual({ actual: 999n, txnCount: 1 });
  });
});

describe('computeTracking (FR-022–FR-024)', () => {
  const lines = [
    line('courses', 40000n, { isEnvelope: true }),
    line('loyer', 95000n),
    line('psy', 6000n, { group: 'personal', ownerMembershipId: 'a', isPrivate: true }),
    line('rien', 0n),
  ];

  it('marks lines without transactions as not tracked and leaves them out of actual totals', () => {
    const t = computeTracking({ lines, txns: [tx(25000n, [{ lineId: 'courses' }]), tx(1000n, [])] });
    const courses = t.lines.find((l) => l.lineId === 'courses')!;
    expect(courses).toMatchObject({ actual: 25000n, difference: -15000n, differencePermille: -375, txnCount: 1 });
    expect(courses.envelope?.level).toBe('ok');
    const loyer = t.lines.find((l) => l.lineId === 'loyer')!;
    expect(loyer).toMatchObject({ actual: null, difference: null, differencePermille: null, envelope: null });

    const shared = t.groups.recurring_shared;
    expect(shared).toEqual({
      plannedAll: 135000n,
      plannedTracked: 40000n,
      actual: 25000n,
      difference: -15000n,
      differencePermille: -375,
      notTrackedCount: 2,
    });
    expect(t.groups.personal.notTrackedCount).toBe(1);
    expect(t.groups.one_off_shared.plannedAll).toBe(0n);
    expect(t.unassigned).toEqual({ actual: 1000n, txnCount: 1 });
    expect(t.month).toEqual({
      plannedAll: 141000n,
      plannedTracked: 40000n,
      actual: 26000n,
      difference: -14000n,
      differencePermille: -350,
      notTrackedCount: 3,
    });
  });

  it('gives null percent when planned is 0 and keeps a refund-only line tracked', () => {
    const t = computeTracking({ lines, txns: [tx(-500n, [{ lineId: 'rien' }])] });
    expect(t.lines.find((l) => l.lineId === 'rien')).toMatchObject({ actual: -500n, difference: -500n, differencePermille: null });
  });

  it('uses fixedActual for lines summarised elsewhere (private aggregates on device)', () => {
    const t = computeTracking({
      lines: [line('private:a', 10000n, { group: 'personal', fixedActual: 7000n }), line('p2', 500n, { group: 'personal', fixedActual: null })],
      txns: [],
    });
    expect(t.groups.personal).toMatchObject({ plannedAll: 10500n, plannedTracked: 10000n, actual: 7000n, notTrackedCount: 1 });
  });

  it('computes sub-item spending inside envelopes', () => {
    const anim = line('anim', 12000n, { isEnvelope: true, subItems: [{ id: 'croq', amount: 8000n }, { id: 'lit', amount: null }] });
    const t = computeTracking({
      lines: [anim],
      txns: [
        { ...tx(3000n, [{ lineId: 'anim' }]), parts: [{ lineId: 'anim', subItemId: 'croq', amount: 3000n }] },
        { ...tx(1500n, [{ lineId: 'anim' }]), parts: [{ lineId: 'anim', subItemId: 'lit', amount: 1500n }] },
      ],
    });
    expect(t.lines[0].envelope?.subItems).toEqual([
      { subItemId: 'croq', spent: 3000n, remaining: 5000n },
      { subItemId: 'lit', spent: 1500n, remaining: null },
    ]);
  });

  it('aggregates private lines per owner', () => {
    const t = computeTracking({ lines, txns: [tx(6000n, [{ lineId: 'psy' }])] });
    expect(t.privateByOwner.get('a')).toEqual({ planned: 6000n, actual: 6000n });
  });
});
