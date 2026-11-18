import { envelopeState, subItemState } from '../../src/domain/tracking/envelope';

describe('envelopeState (FR-026, strict thresholds)', () => {
  it.each([
    [40000n, 25000n, { remaining: 15000n, over: 0n, progressPermille: 625, level: 'ok' }],
    [40000n, 32000n, { remaining: 8000n, over: 0n, progressPermille: 800, level: 'ok' }],
    [40000n, 33000n, { remaining: 7000n, over: 0n, progressPermille: 825, level: 'warning' }],
    [40000n, 40000n, { remaining: 0n, over: 0n, progressPermille: 1000, level: 'warning' }],
    [40000n, 42000n, { remaining: 0n, over: 2000n, progressPermille: 1050, level: 'over' }],
    [0n, 500n, { remaining: 0n, over: 500n, progressPermille: 1000, level: 'over' }],
    [0n, 0n, { remaining: 0n, over: 0n, progressPermille: 0, level: 'ok' }],
    [40000n, -2000n, { remaining: 40000n, over: 0n, progressPermille: 0, level: 'ok' }],
  ] as const)('planned %s, spent %s', (planned, spent, expected) => {
    expect(envelopeState(planned, spent)).toEqual({ spent, ...expected });
  });
});

describe('subItemState (FR-027)', () => {
  it('gives remaining only when the sub-item has an amount', () => {
    expect(subItemState(8000n, 3000n)).toEqual({ spent: 3000n, remaining: 5000n });
    expect(subItemState(8000n, 9000n)).toEqual({ spent: 9000n, remaining: 0n });
    expect(subItemState(null, 3000n)).toEqual({ spent: 3000n, remaining: null });
  });
});
