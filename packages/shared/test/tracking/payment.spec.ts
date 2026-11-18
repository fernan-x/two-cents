import { TrackingError } from '../../src/domain/tracking/errors';
import { defaultMethod, defaultPlanned, validateParts, validatePayment } from '../../src/domain/tracking/payment';
import type { Payer } from '../../src/domain/tracking/types';

const me: Payer = { kind: 'member', membershipId: 'a' };
const joint: Payer = { kind: 'joint' };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof TrackingError ? e.code : 'not a TrackingError';
  }
  return undefined;
}

describe('validatePayment (FR-005)', () => {
  it.each([
    [me, 'personal_card', true],
    [me, 'meal_voucher', true],
    [me, 'joint_card', false],
    [me, 'cash', true],
    [me, 'transfer', true],
    [joint, 'personal_card', false],
    [joint, 'meal_voucher', false],
    [joint, 'joint_card', true],
    [joint, 'cash', true],
    [joint, 'transfer', true],
  ] as const)('%o + %s → %s', (payer, method, ok) => {
    expect(codeOf(() => validatePayment(payer, method))).toBe(ok ? undefined : 'INVALID_PAYMENT_METHOD');
  });
});

describe('defaultPlanned (FR-004)', () => {
  it('is planned with a line, unplanned without', () => {
    expect(defaultPlanned([{ lineId: 'l', subItemId: null, amount: 100n }])).toBe(true);
    expect(defaultPlanned([])).toBe(false);
  });
});

describe('validateParts (FR-006)', () => {
  it('accepts no part (unassigned) and parts that add up', () => {
    expect(codeOf(() => validateParts(1000n, []))).toBeUndefined();
    expect(
      codeOf(() =>
        validateParts(12000n, [
          { lineId: 'a', subItemId: null, amount: 9000n },
          { lineId: 'b', subItemId: null, amount: 3000n },
        ]),
      ),
    ).toBeUndefined();
    expect(codeOf(() => validateParts(-2000n, [{ lineId: 'a', subItemId: null, amount: -2000n }]))).toBeUndefined();
  });

  it('reports the signed difference when parts do not add up', () => {
    try {
      validateParts(12000n, [
        { lineId: 'a', subItemId: null, amount: 9000n },
        { lineId: 'b', subItemId: null, amount: 2000n },
      ]);
      throw new Error('expected a mismatch');
    } catch (e) {
      expect(e).toBeInstanceOf(TrackingError);
      expect((e as TrackingError).code).toBe('PARTS_MISMATCH');
      expect((e as TrackingError).details).toEqual({ differenceMinor: 1000n });
    }
  });

  it('refuses a zero amount, a zero part, a part of the other sign, two unassigned parts', () => {
    expect(codeOf(() => validateParts(0n, []))).toBe('ZERO_AMOUNT');
    expect(
      codeOf(() =>
        validateParts(100n, [
          { lineId: 'a', subItemId: null, amount: 100n },
          { lineId: 'b', subItemId: null, amount: 0n },
        ]),
      ),
    ).toBe('INVALID_PART');
    expect(
      codeOf(() =>
        validateParts(100n, [
          { lineId: 'a', subItemId: null, amount: 200n },
          { lineId: 'b', subItemId: null, amount: -100n },
        ]),
      ),
    ).toBe('INVALID_PART');
    expect(
      codeOf(() =>
        validateParts(200n, [
          { lineId: null, subItemId: null, amount: 100n },
          { lineId: null, subItemId: null, amount: 100n },
        ]),
      ),
    ).toBe('INVALID_PART');
  });

  it('refuses amounts above 1 000 000,00 €', () => {
    expect(codeOf(() => validateParts(100_000_001n, []))).toBe('AMOUNT_TOO_LARGE');
    expect(codeOf(() => validateParts(-100_000_001n, []))).toBe('AMOUNT_TOO_LARGE');
    expect(codeOf(() => validateParts(100_000_000n, []))).toBeUndefined();
  });
});

describe('defaultMethod (FR-005)', () => {
  it('uses the last method for that payer, else a default per payer kind', () => {
    const last = [{ payer: me, paymentMethod: 'cash' as const }];
    expect(defaultMethod(me, last)).toBe('cash');
    expect(defaultMethod({ kind: 'member', membershipId: 'b' }, last)).toBe('personal_card');
    expect(defaultMethod(joint, last)).toBe('joint_card');
    expect(defaultMethod(joint, [{ payer: joint, paymentMethod: 'transfer' }])).toBe('transfer');
  });
});
