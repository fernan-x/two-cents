import { PlanningError } from './errors';
import { assertAmount } from './split';

export const FORMULA_KINDS = ['per_year', 'per_half_year', 'per_quarter', 'times'] as const;
export type FormulaKind = (typeof FORMULA_KINDS)[number];

/** An amount entered as a periodic or repeated cost (FR-023). `factor` only matters for `times`. */
export interface Formula {
  kind: FormulaKind;
  baseMinor: bigint;
  factor: number;
}

const DIVISOR: Record<Exclude<FormulaKind, 'times'>, bigint> = {
  per_year: 12n,
  per_half_year: 6n,
  per_quarter: 3n,
};

/** Monthly amount of a formula, rounded half-up to the cent (e.g. 80 €/an → 6,67 €). */
export function monthlyFromFormula(formula: Formula): bigint {
  if (formula.baseMinor < 0n) throw new PlanningError('INVALID_AMOUNT');
  let monthly: bigint;
  if (formula.kind === 'times') {
    if (!Number.isInteger(formula.factor) || formula.factor < 1 || formula.factor > 99)
      throw new PlanningError('INVALID_FORMULA');
    monthly = formula.baseMinor * BigInt(formula.factor);
  } else {
    const d = DIVISOR[formula.kind];
    if (d === undefined) throw new PlanningError('INVALID_FORMULA');
    monthly = (formula.baseMinor * 2n + d) / (2n * d);
  }
  assertAmount(monthly);
  return monthly;
}
