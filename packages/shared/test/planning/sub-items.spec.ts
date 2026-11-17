import { PlanningError } from '../../src/domain/planning/errors';
import { validateSubItems } from '../../src/domain/planning/sub-items';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return (e as PlanningError).code;
  }
  return undefined;
};

describe('validateSubItems (FR-015)', () => {
  it('passes when the amounts fit in the total, ignoring missing amounts', () => {
    expect(code(() => validateSubItems(1000n, [{ amountMinor: 400n }, { amountMinor: null }, { amountMinor: 600n }]))).toBeUndefined();
    expect(code(() => validateSubItems(0n, []))).toBeUndefined();
  });
  it('refuses amounts above the total', () => {
    expect(code(() => validateSubItems(1000n, [{ amountMinor: 600n }, { amountMinor: 401n }]))).toBe('SUB_ITEMS_EXCEED_TOTAL');
  });
  it('refuses negative amounts', () => {
    expect(code(() => validateSubItems(1000n, [{ amountMinor: -1n }]))).toBe('INVALID_AMOUNT');
  });
});
