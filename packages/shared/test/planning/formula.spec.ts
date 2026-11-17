import { PlanningError } from '../../src/domain/planning/errors';
import { monthlyFromFormula } from '../../src/domain/planning/formula';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as PlanningError).code;
  }
  return undefined;
};

describe('monthlyFromFormula (FR-023, half-up to the cent)', () => {
  it('per year ÷ 12', () => {
    expect(monthlyFromFormula({ kind: 'per_year', baseMinor: 8000n, factor: 1 })).toBe(667n);
  });
  it('per half-year ÷ 6', () => {
    expect(monthlyFromFormula({ kind: 'per_half_year', baseMinor: 10000n, factor: 1 })).toBe(1667n);
  });
  it('per quarter ÷ 3', () => {
    expect(monthlyFromFormula({ kind: 'per_quarter', baseMinor: 10000n, factor: 1 })).toBe(3333n);
  });
  it('times N', () => {
    expect(monthlyFromFormula({ kind: 'times', baseMinor: 4700n, factor: 2 })).toBe(9400n);
  });
  it('rounds half up', () => {
    expect(monthlyFromFormula({ kind: 'per_year', baseMinor: 6n, factor: 1 })).toBe(1n);
    expect(monthlyFromFormula({ kind: 'per_year', baseMinor: 5n, factor: 1 })).toBe(0n);
    expect(monthlyFromFormula({ kind: 'per_quarter', baseMinor: 15n, factor: 1 })).toBe(5n);
    expect(monthlyFromFormula({ kind: 'per_half_year', baseMinor: 3n, factor: 1 })).toBe(1n);
  });
  it('ignores factor for divisions', () => {
    expect(monthlyFromFormula({ kind: 'per_year', baseMinor: 1200n, factor: 7 })).toBe(100n);
  });
  it('times needs an integer factor between 1 and 99', () => {
    expect(code(() => monthlyFromFormula({ kind: 'times', baseMinor: 1n, factor: 0 }))).toBe('INVALID_FORMULA');
    expect(code(() => monthlyFromFormula({ kind: 'times', baseMinor: 1n, factor: 100 }))).toBe('INVALID_FORMULA');
    expect(code(() => monthlyFromFormula({ kind: 'times', baseMinor: 1n, factor: 1.5 }))).toBe('INVALID_FORMULA');
  });
  it('refuses negative bases and results above the limit', () => {
    expect(code(() => monthlyFromFormula({ kind: 'per_year', baseMinor: -1n, factor: 1 }))).toBe('INVALID_AMOUNT');
    expect(code(() => monthlyFromFormula({ kind: 'times', baseMinor: 60_000_000n, factor: 2 }))).toBe('AMOUNT_TOO_LARGE');
  });
});
