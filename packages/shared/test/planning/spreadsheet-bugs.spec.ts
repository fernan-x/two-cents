import { parseAmount } from '../../src/domain/money';
import { computeMonthSummary } from '../../src/domain/planning/summary';
import type { PlanLine } from '../../src/domain/planning/types';
import { expected, FABIEN, incomes, lines, MAELLE, members } from '../fixtures/novembre-2026';

/** Regression tests for the two bugs of the household spreadsheet (spec "Computed figures"). */
describe('spreadsheet bugs never come back', () => {
  it('bug 1: an amount typed as text "12,5" is counted', () => {
    expect(parseAmount('12,5', 'EUR')).toBe(1250n);
    const spotify = lines.find((l) => l.label === 'Spotify')!;
    expect(spotify.total).toBe(1250n);
    const summary = computeMonthSummary({ members, incomes, lines, privateAggregates: [] });
    const maelle = summary.members.find((m) => m.membershipId === MAELLE)!;
    expect(maelle.di).toBe(14432n);
    expect(maelle.di).not.toBe(13182n); // what the spreadsheet summed
  });

  it('bug 2: every shared line is in every member total, including a 0 € share', () => {
    const zeroForMaelle: PlanLine = {
      group: 'recurring_shared',
      kind: 'expense',
      total: 4000n,
      shares: { [MAELLE]: 0n, [FABIEN]: 4000n },
    };
    const all = [...lines, zeroForMaelle];
    const summary = computeMonthSummary({ members, incomes, lines: all, privateAggregates: [] });
    const m = summary.members.find((x) => x.membershipId === MAELLE)!;
    const f = summary.members.find((x) => x.membershipId === FABIEN)!;
    expect(m.dcr).toBe(expected[MAELLE].dcr);
    expect(f.dcr).toBe(expected[FABIEN].dcr + 4000n);
    const sumMembers = summary.members.reduce((s, x) => s + x.di + x.dcr + x.dce, 0n);
    const sumLines = all.reduce((s, l) => s + l.total, 0n);
    expect(summary.household.planned).toBe(sumMembers);
    expect(summary.household.planned).toBe(sumLines);
  });
});
