import { MAX_AMOUNT_MINOR } from '../money';
import { TrackingError } from './errors';
import type { Payer, PaymentMethod, TxPart } from './types';

/** FR-005: a personal card or meal vouchers need a member; the joint card needs the joint account. */
export function validatePayment(payer: Payer, method: PaymentMethod): void {
  const member = payer.kind === 'member';
  const ok =
    method === 'cash' || method === 'transfer' || (method === 'joint_card' ? !member : member);
  if (!ok) throw new TrackingError('INVALID_PAYMENT_METHOD');
}

/** FR-004: linked to a line → planned; no line → unplanned. */
export function defaultPlanned(parts: readonly TxPart[]): boolean {
  return parts.length > 0;
}

/**
 * FR-006: a non-zero amount within ±1 000 000,00 €; parts (if any) non-zero, of the transaction's
 * sign, at most one unassigned, adding up exactly to the amount.
 */
export function validateParts(amount: bigint, parts: readonly TxPart[]): void {
  if (amount === 0n) throw new TrackingError('ZERO_AMOUNT');
  if (amount > MAX_AMOUNT_MINOR || -amount > MAX_AMOUNT_MINOR) throw new TrackingError('AMOUNT_TOO_LARGE');
  if (parts.length === 0) return;
  let unassigned = 0;
  let sum = 0n;
  for (const p of parts) {
    if (p.amount === 0n || p.amount < 0n !== amount < 0n) throw new TrackingError('INVALID_PART');
    if (p.lineId === null && ++unassigned > 1) throw new TrackingError('INVALID_PART');
    sum += p.amount;
  }
  if (sum !== amount) throw new TrackingError('PARTS_MISMATCH', { differenceMinor: amount - sum });
}

const samePayer = (a: Payer, b: Payer) =>
  a.kind === b.kind && (a.kind === 'joint' || (b.kind === 'member' && a.membershipId === b.membershipId));

/** FR-005: the payer's last method, else joint card for the joint account and personal card for a member. */
export function defaultMethod(
  payer: Payer,
  lastMethodByPayer: readonly { payer: Payer; paymentMethod: PaymentMethod }[],
): PaymentMethod {
  const last = lastMethodByPayer.find((l) => samePayer(l.payer, payer));
  return last?.paymentMethod ?? (payer.kind === 'joint' ? 'joint_card' : 'personal_card');
}
