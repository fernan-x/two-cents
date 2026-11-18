import { splitByWeights } from '../planning/split';
import { byOrder, type Group, type PlanMember } from '../planning/types';
import type { Balance, Tx } from './types';

export interface BalanceLine {
  group: Group;
  /** Planned per-member shares of the line in the month. */
  shares: Readonly<Record<string, bigint>>;
}

export interface BalanceInput {
  /** Contributing members of the month, any order. */
  members: readonly PlanMember[];
  txns: readonly Tx[];
  /** Lines by id. */
  lines: Readonly<Record<string, BalanceLine>>;
  /** Payments already made between members for this month. */
  settlements: readonly { from: string; to: string; amount: bigint }[];
}

/**
 * Who owes whom for the month (FR-029–FR-032, clarifications Q1/Q2). A shared transaction paid by
 * a member (card, meal vouchers, cash, transfer) is divided by its line's planned shares, or
 * equally when unassigned or when the line's planned total is 0, with the 003 remainder rule.
 * Each other member owes the payer their share. Netted per pair, minus settlements.
 */
export function computeBalances(input: BalanceInput): Balance[] {
  const members = byOrder(input.members);
  const ids = members.map((m) => m.membershipId);
  const owed = new Map<string, bigint>();
  const key = (from: string, to: string) => `${from}\u0000${to}`;
  const add = (from: string, to: string, amount: bigint) => owed.set(key(from, to), (owed.get(key(from, to)) ?? 0n) + amount);

  for (const t of input.txns) {
    if (t.payer.kind !== 'member') continue;
    const payer = t.payer.membershipId;
    const pieces =
      t.parts.length > 0 ? t.parts : t.isShared ? [{ lineId: null, subItemId: null, amount: t.amount }] : [];
    for (const piece of pieces) {
      const line = piece.lineId ? input.lines[piece.lineId] : undefined;
      if (piece.lineId && !line) continue;
      if (line?.group === 'personal') continue;
      if (!line && !t.isShared) continue;
      let weights = ids.map((id) => (line ? (line.shares[id] ?? 0n) : 1n));
      if (weights.every((w) => w === 0n)) weights = ids.map(() => 1n);
      const negative = piece.amount < 0n;
      const split = splitByWeights(negative ? -piece.amount : piece.amount, weights);
      ids.forEach((id, k) => {
        if (id !== payer && split[k] !== 0n) add(id, payer, negative ? -split[k] : split[k]);
      });
    }
  }
  for (const s of input.settlements) add(s.to, s.from, s.amount);

  const balances: Balance[] = [];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const net = (owed.get(key(a, b)) ?? 0n) - (owed.get(key(b, a)) ?? 0n);
      if (net > 0n) balances.push({ from: a, to: b, amount: net });
      else if (net < 0n) balances.push({ from: b, to: a, amount: -net });
    }
  return balances;
}
