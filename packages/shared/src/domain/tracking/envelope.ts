import type { EnvelopeState, SubItemState } from './types';

const max0 = (v: bigint) => (v > 0n ? v : 0n);

/**
 * FR-026: spent / remaining / overrun of an envelope. Thresholds are strict (spec assumption):
 * warning when spent is above 80 % of planned, over budget when above 100 %. Integer only.
 */
export function envelopeState(planned: bigint, spent: bigint): EnvelopeState {
  const positive = max0(spent);
  const remaining = max0(planned - positive);
  const over = max0(spent - planned);
  const progressPermille =
    planned > 0n ? Number((positive * 1000n) / planned) : positive > 0n ? 1000 : 0;
  const level = spent > planned ? 'over' : spent * 1000n > planned * 800n ? 'warning' : 'ok';
  return { spent, remaining, over, progressPermille, level };
}

/** FR-027: a sub-item's spending, and what is left when it has an amount. */
export function subItemState(amount: bigint | null, spent: bigint): SubItemState {
  return { spent, remaining: amount === null ? null : max0(amount - max0(spent)) };
}
