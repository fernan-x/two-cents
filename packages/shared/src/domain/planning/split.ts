import { MAX_AMOUNT_MINOR } from '../money';
import { PlanningError } from './errors';
import { byOrder, type PlanIncome, type PlanMember, type SplitMode } from './types';

/** Throws unless 0 ≤ amount ≤ MAX_AMOUNT_MINOR. */
export function assertAmount(amount: bigint): void {
  if (amount < 0n) throw new PlanningError('INVALID_AMOUNT');
  if (amount > MAX_AMOUNT_MINOR) throw new PlanningError('AMOUNT_TOO_LARGE');
}

/**
 * Splits `total` cents by `weights`, exactly (FR-021). Each part gets the floor of its exact share;
 * the remaining cents go one by one to the largest fractional parts, ties to the lowest index.
 * Callers pass weights in member order so ties follow the documented rule.
 */
export function splitByWeights(total: bigint, weights: readonly bigint[]): bigint[] {
  const sum = weights.reduce((s, w) => s + w, 0n);
  if (sum <= 0n) throw new PlanningError('NO_INCOME_FOR_PROPORTIONAL');
  const parts = weights.map((w) => (total * w) / sum);
  const remainders = weights.map((w, index) => ({ index, rest: (total * w) % sum }));
  let left = total - parts.reduce((s, p) => s + p, 0n);
  remainders.sort((a, b) => (a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1));
  for (const r of remainders) {
    if (left === 0n) break;
    parts[r.index] += 1n;
    left -= 1n;
  }
  return parts;
}

export interface ShareInput {
  mode: SplitMode;
  /** Required except for `custom`, where it is computed when omitted. */
  total?: bigint;
  /** `custom` only. */
  enteredShares?: Readonly<Record<string, bigint>>;
  /** `one_payer` only. */
  payerMembershipId?: string;
  /** Contributing members of the month. */
  members: readonly PlanMember[];
  incomes: readonly PlanIncome[];
}

export interface ShareResult {
  total: bigint;
  /** One entry per contributing member, 0 allowed. */
  shares: Record<string, bigint>;
}

/** Household-counted income per member (FR-028). */
export function countedIncomeOf(membershipId: string, incomes: readonly PlanIncome[]): bigint {
  return incomes.reduce((s, i) => (i.membershipId === membershipId && i.counts ? s + i.amount : s), 0n);
}

/** Shares of a shared line for its split mode (FR-017, FR-020, FR-022). They always add up to the total. */
export function computeShares(input: ShareInput): ShareResult {
  const members = byOrder(input.members);
  const ids = new Set(members.map((m) => m.membershipId));
  const zeroes = (): Record<string, bigint> => Object.fromEntries(members.map((m) => [m.membershipId, 0n]));

  if (input.mode === 'custom') {
    const shares = zeroes();
    for (const [id, amount] of Object.entries(input.enteredShares ?? {})) {
      if (!ids.has(id)) throw new PlanningError('UNKNOWN_MEMBER');
      assertAmount(amount);
      shares[id] = amount;
    }
    const sum = Object.values(shares).reduce((s, v) => s + v, 0n);
    assertAmount(sum);
    if (input.total !== undefined && input.total !== sum)
      throw new PlanningError('SPLIT_MISMATCH', { differenceMinor: input.total - sum });
    return { total: sum, shares };
  }

  if (input.total === undefined) throw new PlanningError('TOTAL_REQUIRED');
  const total = input.total;
  assertAmount(total);

  if (input.mode === 'one_payer') {
    if (!input.payerMembershipId || !ids.has(input.payerMembershipId)) throw new PlanningError('UNKNOWN_MEMBER');
    return { total, shares: { ...zeroes(), [input.payerMembershipId]: total } };
  }

  const weights =
    input.mode === 'equal' ? members.map(() => 1n) : members.map((m) => countedIncomeOf(m.membershipId, input.incomes));
  const parts = splitByWeights(total, weights);
  return { total, shares: Object.fromEntries(members.map((m, i) => [m.membershipId, parts[i]])) };
}
