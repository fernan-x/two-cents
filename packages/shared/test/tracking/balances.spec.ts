import type { PlanMember } from '../../src/domain/planning/types';
import { computeBalances, type BalanceLine } from '../../src/domain/tracking/balances';
import type { PaymentMethod, Tx, TxPart } from '../../src/domain/tracking/types';

const M = 'maelle';
const F = 'fabien';
const C = 'camille';
const two: PlanMember[] = [
  { membershipId: M, order: 0 },
  { membershipId: F, order: 1 },
];
const three: PlanMember[] = [...two, { membershipId: C, order: 2 }];

const lines: Record<string, BalanceLine> = {
  courses: { group: 'recurring_shared', shares: { [M]: 10000n, [F]: 30000n } },
  maison: { group: 'one_off_shared', shares: { [M]: 5000n, [F]: 5000n } },
  zero: { group: 'recurring_shared', shares: { [M]: 0n, [F]: 0n } },
  phone: { group: 'personal', shares: { [F]: 2000n } },
  fabienOnly: { group: 'recurring_shared', shares: { [M]: 0n, [F]: 5000n } },
};

let n = 0;
function tx(
  payer: string | 'joint',
  amount: bigint,
  parts: { lineId: string | null; amount?: bigint }[],
  opts: { method?: PaymentMethod; isShared?: boolean } = {},
): Tx {
  return {
    id: `t${n++}`,
    date: '2026-11-12',
    amount,
    payer: payer === 'joint' ? { kind: 'joint' } : { kind: 'member', membershipId: payer },
    method: opts.method ?? (payer === 'joint' ? 'joint_card' : 'personal_card'),
    isPlanned: true,
    isShared: opts.isShared ?? false,
    parts: parts.map((p): TxPart => ({ lineId: p.lineId, subItemId: null, amount: p.amount ?? amount })),
  };
}

const run = (txns: Tx[], members = two, settlements: { from: string; to: string; amount: bigint }[] = []) =>
  computeBalances({ members, txns, lines, settlements });

describe('computeBalances (clarifications Q1, Q2)', () => {
  it('splits by the line planned shares: Maëlle owes Fabien 26,12 €', () => {
    expect(run([tx(F, 10447n, [{ lineId: 'courses' }])])).toEqual([{ from: M, to: F, amount: 2612n }]);
  });

  it('treats meal vouchers like a personal card', () => {
    expect(run([tx(F, 10447n, [{ lineId: 'courses' }], { method: 'meal_voucher' })])).toEqual([{ from: M, to: F, amount: 2612n }]);
  });

  it('ignores the joint account, cash paid by the joint account and personal lines', () => {
    expect(run([tx('joint', 10447n, [{ lineId: 'courses' }])])).toEqual([]);
    expect(run([tx('joint', 500n, [{ lineId: 'courses' }], { method: 'cash' })])).toEqual([]);
    expect(run([tx(F, 2000n, [{ lineId: 'phone' }])])).toEqual([]);
  });

  it('splits unassigned shared spending equally, ignores unassigned personal spending', () => {
    expect(run([tx(M, 4000n, [], { isShared: true })])).toEqual([{ from: F, to: M, amount: 2000n }]);
    expect(run([tx(M, 4000n, [], { isShared: false })])).toEqual([]);
  });

  it('splits equally when the line planned total is 0', () => {
    expect(run([tx(F, 1001n, [{ lineId: 'zero' }])])).toEqual([{ from: M, to: F, amount: 501n }]);
  });

  it('reverses for refunds', () => {
    expect(run([tx(F, -2000n, [{ lineId: 'courses' }])])).toEqual([{ from: F, to: M, amount: 500n }]);
  });

  it('uses each part line for a split transaction', () => {
    expect(
      run([
        tx(F, 12000n, [
          { lineId: 'courses', amount: 8000n },
          { lineId: 'maison', amount: 4000n },
        ]),
      ]),
    ).toEqual([{ from: M, to: F, amount: 2000n + 2000n }]);
  });

  it('nets both directions into one statement and subtracts settlements', () => {
    const txns = [tx(F, 10447n, [{ lineId: 'courses' }]), tx(M, 4000n, [{ lineId: 'maison' }])];
    expect(run(txns)).toEqual([{ from: M, to: F, amount: 612n }]);
    expect(run(txns, two, [{ from: M, to: F, amount: 612n }])).toEqual([]);
    expect(run(txns, two, [{ from: M, to: F, amount: 1000n }])).toEqual([{ from: F, to: M, amount: 388n }]);
  });

  it('when someone else pays a line fully planned for Fabien, Fabien owes it all', () => {
    expect(run([tx(M, 3000n, [{ lineId: 'fabienOnly' }])])).toEqual([{ from: F, to: M, amount: 3000n }]);
  });

  it('stays pairwise with three members and follows the remainder rule', () => {
    const balances = run([tx(C, 1000n, [], { isShared: true })], three);
    expect(balances).toEqual([
      { from: M, to: C, amount: 334n },
      { from: F, to: C, amount: 333n },
    ]);
  });

  it('does not depend on transaction order', () => {
    const txns = [tx(F, 10447n, [{ lineId: 'courses' }]), tx(M, 4000n, [{ lineId: 'maison' }]), tx(M, 333n, [], { isShared: true })];
    expect(run([...txns].reverse())).toEqual(run(txns));
  });
});
