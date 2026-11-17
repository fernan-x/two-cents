import fc from 'fast-check';
import { parseAmount } from '../../src/domain/money';
import { monthlyFromFormula } from '../../src/domain/planning/formula';
import { computeShares } from '../../src/domain/planning/split';
import { computeMonthSummary } from '../../src/domain/planning/summary';
import type { Group, Kind, PlanIncome, PlanLine, PlanMember, PrivateAggregate, SplitMode } from '../../src/domain/planning/types';

/**
 * SC-002: on random months the summary equals an independent recomputation, to the cent.
 * The oracle below deliberately uses plain loops and no production helper.
 */

const MAX = 100_000_000; // 1 000 000,00 €

/** Cents → a string a person could type: "1234,5", "1 234.56", "12". */
const typedAmount = (cents: number, comma: boolean, spaces: boolean): string => {
  const euros = Math.floor(cents / 100);
  const rest = cents % 100;
  let intPart = String(euros);
  if (spaces) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  if (rest === 0) return intPart;
  let frac = String(rest).padStart(2, '0');
  if (frac.endsWith('0')) frac = frac.slice(0, 1);
  return `${intPart}${comma ? ',' : '.'}${frac}`;
};

const amountArb = fc
  .tuple(fc.integer({ min: 0, max: MAX }), fc.boolean(), fc.boolean())
  .map(([cents, comma, spaces]) => ({ cents, typed: typedAmount(cents, comma, spaces) }));

const parse = (typed: string): bigint => {
  const v = parseAmount(typed, 'EUR');
  if (v === null) throw new Error(`unparseable ${typed}`);
  return v;
};

interface RawLine {
  group: Group;
  kind: Kind;
  mode: SplitMode;
  amount: { cents: number; typed: string };
  owner: number;
  payer: number;
  custom: { cents: number; typed: string }[];
  formula: null | { kind: 'per_year' | 'per_half_year' | 'per_quarter' | 'times'; factor: number };
}

const lineArb: fc.Arbitrary<RawLine> = fc.record({
  group: fc.constantFrom<Group>('personal', 'recurring_shared', 'one_off_shared'),
  kind: fc.constantFrom<Kind>('expense', 'savings'),
  mode: fc.constantFrom<SplitMode>('custom', 'equal', 'proportional', 'one_payer'),
  amount: amountArb,
  owner: fc.nat(5),
  payer: fc.nat(5),
  custom: fc.array(
    fc.integer({ min: 0, max: Math.floor(MAX / 6) }).map((c) => ({ cents: c, typed: typedAmount(c, true, false) })),
    { minLength: 6, maxLength: 6 },
  ),
  formula: fc.option(
    fc.record({
      kind: fc.constantFrom<'per_year' | 'per_half_year' | 'per_quarter' | 'times'>('per_year', 'per_half_year', 'per_quarter', 'times'),
      factor: fc.integer({ min: 1, max: 9 }),
    }),
    { nil: null },
  ),
});

const monthArb = fc.record({
  memberCount: fc.integer({ min: 1, max: 6 }),
  incomes: fc.array(fc.record({ who: fc.nat(5), amount: amountArb, counts: fc.boolean() }), { maxLength: 12 }),
  lines: fc.array(lineArb, { maxLength: 80 }),
  privates: fc.array(fc.record({ who: fc.nat(5), total: fc.nat(MAX), savingsRatio: fc.nat(100) }), { maxLength: 4 }),
});

type RawMonth = typeof monthArb extends fc.Arbitrary<infer T> ? T : never;

function build(raw: RawMonth) {
  const members: PlanMember[] = Array.from({ length: raw.memberCount }, (_, i) => ({ membershipId: `m${i}`, order: i }));
  const pick = (n: number) => members[n % members.length].membershipId;
  const incomes: PlanIncome[] = raw.incomes.map((i) => ({
    membershipId: pick(i.who),
    amount: parse(i.amount.typed),
    counts: i.counts,
  }));
  const counted = incomes.some((i) => i.counts && i.amount > 0n);
  const lines: PlanLine[] = raw.lines.map((l) => {
    let total = parse(l.amount.typed);
    if (l.formula) {
      const base = total / 100n; // keep results under the limit
      total = monthlyFromFormula({ kind: l.formula.kind, baseMinor: base, factor: l.formula.factor });
    }
    if (l.group === 'personal') {
      return { group: l.group, kind: l.kind, total, shares: { [pick(l.owner)]: total } };
    }
    const mode: SplitMode = l.mode === 'proportional' && !counted ? 'equal' : l.mode;
    const result =
      mode === 'custom'
        ? computeShares({
            mode,
            enteredShares: Object.fromEntries(members.map((m, i) => [m.membershipId, parse(l.custom[i].typed)])),
            members,
            incomes,
          })
        : computeShares({ mode, total, payerMembershipId: pick(l.payer), members, incomes });
    return { group: l.group, kind: l.kind, total: result.total, shares: result.shares };
  });
  const privateAggregates: PrivateAggregate[] = raw.privates.map((p) => {
    const total = BigInt(p.total);
    return { membershipId: pick(p.who), total, savings: (total * BigInt(p.savingsRatio)) / 100n };
  });
  return { members, incomes, lines, privateAggregates };
}

/** Independent oracle: naive loops, Number-free bigint sums. */
function oracle(input: ReturnType<typeof build>) {
  const out: Record<string, Record<string, bigint>> = {};
  for (const m of input.members) {
    const row = { counted: 0n, other: 0n, di: 0n, dcr: 0n, dce: 0n, savings: 0n };
    for (const inc of input.incomes) {
      if (inc.membershipId !== m.membershipId) continue;
      if (inc.counts) row.counted += inc.amount;
      else row.other += inc.amount;
    }
    for (const line of input.lines) {
      const share = line.shares[m.membershipId] ?? 0n;
      if (line.group === 'personal') row.di += share;
      if (line.group === 'recurring_shared') row.dcr += share;
      if (line.group === 'one_off_shared') row.dce += share;
      if (line.kind === 'savings') row.savings += share;
    }
    for (const p of input.privateAggregates) {
      if (p.membershipId !== m.membershipId) continue;
      row.di += p.total;
      row.savings += p.savings;
    }
    out[m.membershipId] = row;
  }
  return out;
}

describe('computeMonthSummary — property-based (SC-002)', () => {
  it('matches an independent recomputation on 1 000 random months', () => {
    fc.assert(
      fc.property(monthArb, (raw) => {
        const input = build(raw);
        const summary = computeMonthSummary(input);
        const expected = oracle(input);
        let planned = 0n;
        let left = 0n;
        for (const s of summary.members) {
          const e = expected[s.membershipId];
          expect(s.countedIncome).toBe(e.counted);
          expect(s.otherIncome).toBe(e.other);
          expect(s.di).toBe(e.di);
          expect(s.dcr).toBe(e.dcr);
          expect(s.dce).toBe(e.dce);
          expect(s.whatsLeft).toBe(e.counted - e.di - e.dcr - e.dce);
          expect(s.transfer).toBe(e.dcr + e.dce);
          expect(s.savings).toBe(e.savings);
          expect(s.overrun).toBe(e.counted - e.di - e.dcr - e.dce < 0n);
          planned += e.di + e.dcr + e.dce;
          left += e.counted - e.di - e.dcr - e.dce;
        }
        expect(summary.members).toHaveLength(input.members.length);
        expect(summary.household.planned).toBe(planned);
        expect(summary.household.whatsLeft).toBe(left);
        // Every line counted exactly once
        const privateTotal = input.privateAggregates.reduce((s, p) => s + p.total, 0n);
        expect(summary.household.planned).toBe(input.lines.reduce((s, l) => s + l.total, 0n) + privateTotal);
      }),
      { numRuns: 1000 },
    );
  });

  it('shares always add up to the line total', () => {
    fc.assert(
      fc.property(monthArb, (raw) => {
        for (const line of build(raw).lines) {
          expect(Object.values(line.shares).reduce((s, v) => s + v, 0n)).toBe(line.total);
        }
      }),
      { numRuns: 1000 },
    );
  });

  it('does not depend on line order', () => {
    fc.assert(
      fc.property(monthArb, (raw) => {
        const input = build(raw);
        const reversed = { ...input, lines: [...input.lines].reverse() };
        expect(computeMonthSummary(reversed)).toEqual(computeMonthSummary(input));
      }),
      { numRuns: 200 },
    );
  });
});
