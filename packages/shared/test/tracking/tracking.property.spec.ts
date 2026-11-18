import fc from 'fast-check';
import { parseAmount } from '../../src/domain/money';
import type { Group, PlanMember } from '../../src/domain/planning/types';
import { computeTracking } from '../../src/domain/tracking/actuals';
import { computeBalances, type BalanceLine } from '../../src/domain/tracking/balances';
import { envelopeState } from '../../src/domain/tracking/envelope';
import { computeVouchers } from '../../src/domain/tracking/vouchers';
import type { PaymentMethod, TrackLine, Tx } from '../../src/domain/tracking/types';

/**
 * SC-005: on random months every tracking figure equals an independent recomputation, to the cent.
 * The oracle below uses plain loops and no production helper.
 */

const MAX = 100_000_000;

const typed = (cents: number, comma: boolean): string => {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  return rest === 0 ? String(euros) : `${euros}${comma ? ',' : '.'}${String(rest).padStart(2, '0')}`;
};
const parse = (s: string): bigint => {
  const v = parseAmount(s, 'EUR');
  if (v === null) throw new Error(`unparseable ${s}`);
  return v;
};
const amountArb = (max: number) => fc.tuple(fc.integer({ min: 1, max }), fc.boolean()).map(([c, comma]) => parse(typed(c, comma)));

const METHODS: PaymentMethod[] = ['personal_card', 'joint_card', 'meal_voucher', 'cash', 'transfer'];

const monthArb = fc.record({
  memberCount: fc.integer({ min: 1, max: 6 }),
  lines: fc.array(
    fc.record({
      group: fc.constantFrom<Group>('personal', 'recurring_shared', 'one_off_shared'),
      planned: fc.oneof(fc.constant(0n), amountArb(MAX / 10)),
      owner: fc.nat(5),
      envelope: fc.boolean(),
      weights: fc.array(fc.integer({ min: 0, max: 50_000 }), { minLength: 6, maxLength: 6 }),
    }),
    { maxLength: 80 },
  ),
  txns: fc.array(
    fc.record({
      amount: amountArb(MAX / 100),
      refund: fc.boolean(),
      payer: fc.integer({ min: -1, max: 5 }),
      method: fc.constantFrom(...METHODS),
      shared: fc.boolean(),
      split: fc.array(fc.record({ line: fc.nat(), weight: fc.integer({ min: 1, max: 5 }) }), { maxLength: 3 }),
    }),
    { maxLength: 300 },
  ),
  incomes: fc.array(fc.record({ who: fc.nat(5), amount: amountArb(MAX / 10), voucher: fc.boolean() }), { maxLength: 8 }),
  settlements: fc.array(fc.record({ from: fc.nat(5), to: fc.nat(5), amount: amountArb(MAX / 100) }), { maxLength: 4 }),
});
type Raw = typeof monthArb extends fc.Arbitrary<infer T> ? T : never;

function build(raw: Raw) {
  const members: PlanMember[] = Array.from({ length: raw.memberCount }, (_, i) => ({ membershipId: `m${i}`, order: i }));
  const pick = (n: number) => members[n % members.length].membershipId;
  const lines: TrackLine[] = raw.lines.map((l, i) => {
    const owner = l.group === 'personal' ? pick(l.owner) : null;
    let shares: Record<string, bigint>;
    if (owner) shares = { [owner]: l.planned };
    else {
      // Planned shares: any split adding up to the planned total.
      const w = members.map((_, k) => BigInt(l.weights[k]));
      const sum = w.reduce((s, x) => s + x, 0n);
      shares = {};
      let left = l.planned;
      members.forEach((m, k) => {
        const v = sum === 0n ? (k === 0 ? l.planned : 0n) : k === members.length - 1 ? left : (l.planned * w[k]) / sum;
        shares[m.membershipId] = v;
        left -= v;
      });
    }
    return { id: `l${i}`, group: l.group, planned: l.planned, isEnvelope: l.envelope, ownerMembershipId: owner, isPrivate: false, subItems: [], shares };
  });
  const txns: Tx[] = raw.txns.map((t, i) => {
    const amount = t.refund ? -t.amount : t.amount;
    let payer: Tx['payer'] = t.payer < 0 ? { kind: 'joint' } : { kind: 'member', membershipId: pick(t.payer) };
    let method = t.method;
    if (payer.kind === 'joint' && (method === 'personal_card' || method === 'meal_voucher')) method = 'joint_card';
    if (payer.kind === 'member' && method === 'joint_card') payer = { kind: 'joint' };
    // Parts: weights over chosen lines, last part takes the remainder, so Σ parts = amount.
    const chosen = lines.length === 0 ? [] : t.split.map((s) => ({ line: lines[s.line % lines.length], weight: BigInt(s.weight) }));
    const uniq = chosen.filter((c, k) => chosen.findIndex((d) => d.line.id === c.line.id) === k);
    // Personal parts of different owners cannot mix; keep the first owner only.
    const firstOwner = uniq.find((c) => c.line.ownerMembershipId)?.line.ownerMembershipId;
    const usable = uniq.filter((c) => !c.line.ownerMembershipId || c.line.ownerMembershipId === firstOwner);
    const wsum = usable.reduce((s, c) => s + c.weight, 0n);
    const parts: Tx['parts'] = [];
    let left = amount;
    usable.forEach((c, k) => {
      const v = k === usable.length - 1 ? left : (amount * c.weight) / wsum;
      if (v !== 0n) parts.push({ lineId: c.line.id, subItemId: null, amount: v });
      left -= v;
    });
    if (left !== 0n && parts.length > 0) parts[parts.length - 1].amount += left;
    return { id: `t${i}`, date: '2026-11-10', amount, payer, method, isPlanned: parts.length > 0, isShared: t.shared, parts: parts.filter((p) => p.amount !== 0n && (p.amount < 0n) === (amount < 0n)) };
  }).filter((t) => t.parts.length === 0 || t.parts.reduce((s, p) => s + p.amount, 0n) === t.amount);
  const incomes = raw.incomes.map((i) => ({ membershipId: pick(i.who), amount: i.amount, isMealVoucher: i.voucher }));
  const settlements = raw.settlements
    .filter((s) => pick(s.from) !== pick(s.to))
    .map((s) => ({ from: pick(s.from), to: pick(s.to), amount: s.amount }));
  return { members, lines, txns, incomes, settlements };
}

/* ---------- Independent oracle ---------- */

function oracleSplit(total: bigint, weights: bigint[]): bigint[] {
  let sum = 0n;
  for (const w of weights) sum += w;
  const out: bigint[] = [];
  const rest: bigint[] = [];
  let given = 0n;
  for (const w of weights) {
    out.push((total * w) / sum);
    rest.push((total * w) % sum);
    given += (total * w) / sum;
  }
  let left = total - given;
  while (left > 0n) {
    let best = 0;
    for (let k = 1; k < rest.length; k++) if (rest[k] > rest[best]) best = k;
    out[best] += 1n;
    rest[best] = -1n;
    left -= 1n;
  }
  return out;
}

function oracle(input: ReturnType<typeof build>) {
  const actual: Record<string, bigint | null> = {};
  for (const l of input.lines) {
    let a: bigint | null = null;
    for (const t of input.txns) for (const p of t.parts) if (p.lineId === l.id) a = (a ?? 0n) + p.amount;
    actual[l.id] = a;
  }
  let unassigned = 0n;
  for (const t of input.txns) if (t.parts.length === 0) unassigned += t.amount;
  let plannedTracked = 0n;
  let tracked = 0n;
  let notTracked = 0;
  for (const l of input.lines) {
    if (actual[l.id] === null) notTracked++;
    else {
      plannedTracked += l.planned;
      tracked += actual[l.id]!;
    }
  }
  const owed: Record<string, bigint> = {};
  const add = (from: string, to: string, v: bigint) => {
    owed[`${from}>${to}`] = (owed[`${from}>${to}`] ?? 0n) + v;
  };
  for (const t of input.txns) {
    if (t.payer.kind !== 'member') continue;
    const payerId = t.payer.membershipId;
    const pieces = t.parts.length > 0 ? t.parts : t.isShared ? [{ lineId: null, subItemId: null, amount: t.amount }] : [];
    for (const p of pieces) {
      const line = p.lineId ? input.lines.find((l) => l.id === p.lineId)! : null;
      if (line && line.group === 'personal') continue;
      let weights = input.members.map((m) => (line ? line.shares[m.membershipId] ?? 0n : 1n));
      if (weights.every((w) => w === 0n)) weights = input.members.map(() => 1n);
      const abs = p.amount < 0n ? -p.amount : p.amount;
      const split = oracleSplit(abs, weights);
      input.members.forEach((m, k) => {
        if (m.membershipId === payerId) return;
        add(m.membershipId, payerId, p.amount < 0n ? -split[k] : split[k]);
      });
    }
  }
  for (const s of input.settlements) add(s.to, s.from, s.amount);
  const balances: { from: string; to: string; amount: bigint }[] = [];
  for (let i = 0; i < input.members.length; i++)
    for (let j = i + 1; j < input.members.length; j++) {
      const a = input.members[i].membershipId;
      const b = input.members[j].membershipId;
      const net = (owed[`${a}>${b}`] ?? 0n) - (owed[`${b}>${a}`] ?? 0n);
      if (net > 0n) balances.push({ from: a, to: b, amount: net });
      if (net < 0n) balances.push({ from: b, to: a, amount: -net });
    }
  const vouchers = input.members.map((m) => {
    let income = 0n;
    let spent = 0n;
    for (const i of input.incomes) if (i.membershipId === m.membershipId && i.isMealVoucher) income += i.amount;
    for (const t of input.txns) if (t.method === 'meal_voucher' && t.payer.kind === 'member' && t.payer.membershipId === m.membershipId) spent += t.amount;
    return { membershipId: m.membershipId, income, spent, remaining: income - spent };
  });
  return { actual, unassigned, plannedTracked, tracked, notTracked, balances, vouchers };
}

const sortBalances = (b: { from: string; to: string; amount: bigint }[]) =>
  [...b].sort((x, y) => (x.from + x.to < y.from + y.to ? -1 : 1));

describe('tracking property (SC-005)', () => {
  it('matches the oracle on 1 000 random months', () => {
    fc.assert(
      fc.property(monthArb, (raw) => {
        const input = build(raw);
        const expected = oracle(input);
        const t = computeTracking({ lines: input.lines, txns: input.txns });

        for (const l of t.lines) {
          expect(l.actual).toBe(expected.actual[l.lineId]);
          const line = input.lines.find((x) => x.id === l.lineId)!;
          if (line.isEnvelope) {
            const spent = expected.actual[l.lineId] ?? 0n;
            const pos = spent > 0n ? spent : 0n;
            expect(l.envelope?.remaining).toBe(line.planned > pos ? line.planned - pos : 0n);
            expect(l.envelope?.over).toBe(spent > line.planned ? spent - line.planned : 0n);
            expect(envelopeState(line.planned, spent).level).toBe(l.envelope?.level);
          }
        }
        expect(t.unassigned.actual).toBe(expected.unassigned);
        expect(t.month.plannedTracked).toBe(expected.plannedTracked);
        expect(t.month.actual).toBe(expected.tracked + expected.unassigned);
        expect(t.month.notTrackedCount).toBe(expected.notTracked);

        // Σ line actuals + unassigned = Σ transaction amounts.
        let sumTx = 0n;
        for (const tx of input.txns) sumTx += tx.amount;
        let sumLines = 0n;
        for (const l of t.lines) sumLines += l.actual ?? 0n;
        expect(sumLines + t.unassigned.actual).toBe(sumTx);

        const lines: Record<string, BalanceLine> = Object.fromEntries(input.lines.map((l) => [l.id, { group: l.group, shares: l.shares }]));
        const balances = computeBalances({ members: input.members, txns: input.txns, lines, settlements: input.settlements });
        expect(sortBalances(balances)).toEqual(sortBalances(expected.balances));
        // Order independence.
        const reversed = computeBalances({ members: input.members, txns: [...input.txns].reverse(), lines, settlements: input.settlements });
        expect(sortBalances(reversed)).toEqual(sortBalances(balances));

        expect(computeVouchers({ members: input.members, incomes: input.incomes, txns: input.txns })).toEqual(expected.vouchers);
      }),
      { numRuns: 1000 },
    );
  });
});
