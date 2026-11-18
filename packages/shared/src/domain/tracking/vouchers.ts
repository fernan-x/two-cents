import { byOrder, type PlanMember } from '../planning/types';
import type { Tx, VoucherState } from './types';

/**
 * FR-033: per member, meal-voucher income minus what they paid with meal vouchers this month.
 * Remaining can be negative; refunds paid back in vouchers add back.
 */
export function computeVouchers(input: {
  members: readonly PlanMember[];
  incomes: readonly { membershipId: string; amount: bigint; isMealVoucher: boolean }[];
  txns: readonly Tx[];
}): VoucherState[] {
  return byOrder(input.members).map(({ membershipId }) => {
    let income = 0n;
    for (const i of input.incomes) if (i.isMealVoucher && i.membershipId === membershipId) income += i.amount;
    let spent = 0n;
    for (const t of input.txns)
      if (t.method === 'meal_voucher' && t.payer.kind === 'member' && t.payer.membershipId === membershipId) spent += t.amount;
    return { membershipId, income, spent, remaining: income - spent };
  });
}
