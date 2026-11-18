import {
  defaultPlanned,
  normalizeLabel,
  type PaymentMethod,
  type Tx,
  type TxPart,
  validatePayment,
  validateParts,
} from '@two-cents/shared/domain';

export type TxnOrigin =
  'quick_add' | 'edit_form' | 'paid_as_planned' | 'recurring' | 'import';

export interface TxnPartRecord {
  id: string;
  lineId: string | null;
  subItemId: string | null;
  amountMinor: bigint;
  needsReview: boolean;
  position: number;
}

/** One transaction with its parts (data-model.md `txn` + `txn_part`). */
export interface TxnRecord {
  id: string;
  budgetId: string;
  monthId: string;
  date: string;
  amountMinor: bigint;
  currency: string;
  isRefund: boolean;
  label: string;
  labelNormalized: string;
  /** Null = joint account. */
  payerMembershipId: string | null;
  paymentMethod: PaymentMethod;
  isPlanned: boolean;
  plannedSetByHand: boolean;
  isShared: boolean;
  note: string | null;
  origin: TxnOrigin;
  recurringRuleId: string | null;
  scheduledDate: string | null;
  importKey: string | null;
  version: number;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
  parts: TxnPartRecord[];
  receipts: { id: string; createdAt: Date }[];
}

export const payerOf = (
  t: Pick<TxnRecord, 'payerMembershipId'>,
): Tx['payer'] =>
  t.payerMembershipId
    ? { kind: 'member', membershipId: t.payerMembershipId }
    : { kind: 'joint' };

/** The shared-domain view of a transaction, for every calculation (Principle II). */
export const toTx = (t: TxnRecord): Tx => ({
  id: t.id,
  date: t.date,
  amount: t.amountMinor,
  payer: payerOf(t),
  method: t.paymentMethod,
  isPlanned: t.isPlanned,
  isShared: t.isShared,
  parts: t.parts.map((p): TxPart => ({
    lineId: p.lineId,
    subItemId: p.subItemId,
    amount: p.amountMinor,
  })),
});

/** Throws a TrackingError unless amount, parts and payer/method follow the shared rules. */
export function assertTxnRules(t: TxnRecord): void {
  validateParts(t.amountMinor, toTx(t).parts);
  validatePayment(payerOf(t), t.paymentMethod);
}

/** Derived fields kept consistent on every write. */
export function normalizeTxn(t: TxnRecord): TxnRecord {
  return {
    ...t,
    label: t.label.normalize('NFC').trim(),
    labelNormalized: normalizeLabel(t.label),
    isRefund: t.amountMinor < 0n,
    isPlanned: t.plannedSetByHand ? t.isPlanned : defaultPlanned(toTx(t).parts),
    parts: t.parts.map((p, position) => ({ ...p, position })),
  };
}

/** Field snapshot for history entries (amounts as integer strings, Principle I). */
export function txnSnapshot(t: TxnRecord): Record<string, string | null> {
  return {
    date: t.date,
    amountMinor: t.amountMinor.toString(),
    label: t.label,
    payer: t.payerMembershipId ?? 'joint',
    paymentMethod: t.paymentMethod,
    lines: t.parts
      .map((p) => `${p.lineId ?? '-'}:${p.amountMinor.toString()}`)
      .join(','),
    isPlanned: String(t.isPlanned),
    isShared: String(t.isShared),
    note: t.note,
  };
}
