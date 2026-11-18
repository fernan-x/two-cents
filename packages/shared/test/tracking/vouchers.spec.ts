import { computeVouchers } from '../../src/domain/tracking/vouchers';
import type { Tx } from '../../src/domain/tracking/types';

const M = 'maelle';
const F = 'fabien';
let n = 0;
const tx = (who: string, amount: bigint, method: Tx['method'] = 'meal_voucher'): Tx => ({
  id: `t${n++}`,
  date: '2026-11-05',
  amount,
  payer: { kind: 'member', membershipId: who },
  method,
  isPlanned: true,
  isShared: false,
  parts: [],
});

describe('computeVouchers (FR-033)', () => {
  const members = [
    { membershipId: M, order: 0 },
    { membershipId: F, order: 1 },
  ];
  const incomes = [
    { membershipId: M, amount: 16000n, isMealVoucher: true },
    { membershipId: M, amount: 200000n, isMealVoucher: false },
  ];

  it('subtracts the member meal-voucher spending from their voucher income', () => {
    const v = computeVouchers({ members, incomes, txns: [tx(M, 1250n), tx(M, 4500n), tx(M, 9900n, 'personal_card'), tx(F, 700n)] });
    expect(v).toEqual([
      { membershipId: M, income: 16000n, spent: 5750n, remaining: 10250n },
      { membershipId: F, income: 0n, spent: 700n, remaining: -700n },
    ]);
  });

  it('allows a negative remaining and adds refunds back', () => {
    const v = computeVouchers({ members, incomes, txns: [tx(M, 17000n), tx(M, -500n)] });
    expect(v[0]).toEqual({ membershipId: M, income: 16000n, spent: 16500n, remaining: -500n });
  });
});
