import { z } from 'zod';
import { LocalDate, PersonRef, SignedAmountMinor, TrimmedText } from './budgets';

/** Spec 004: transactions (contracts/rest-api.md "Transactions"). */

const MAX_MINOR = 100_000_000n;

export const PaymentMethod = z.enum(['personal_card', 'joint_card', 'meal_voucher', 'cash', 'transfer']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const Payer = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('member'), membershipId: z.uuid() }),
  z.object({ kind: z.literal('joint') }),
]);
export type Payer = z.infer<typeof Payer>;

/** A signed, non-zero amount of at most 1 000 000,00 € either way. */
export const TxAmountMinor = SignedAmountMinor.refine((s) => BigInt(s) !== 0n, 'amount must not be 0').refine((s) => {
  const v = BigInt(s);
  return v <= MAX_MINOR && -v <= MAX_MINOR;
}, 'amount too large');

export const TxPartInput = z.object({
  lineId: z.uuid().nullable(),
  subItemId: z.uuid().nullable().optional(),
  amountMinor: TxAmountMinor,
});
export type TxPartInput = z.input<typeof TxPartInput>;

export const TxOrigin = z.enum(['quick_add', 'edit_form', 'paid_as_planned', 'recurring', 'import']);
export type TxOrigin = z.infer<typeof TxOrigin>;

export const TxLabel = TrimmedText(1, 60);
export const TxNote = z
  .string()
  .transform((s) => s.normalize('NFC').trim())
  .pipe(z.string().max(500));

export const TransactionCreate = z.object({
  date: LocalDate,
  amountMinor: TxAmountMinor,
  label: TxLabel,
  payer: Payer,
  paymentMethod: PaymentMethod.optional(),
  parts: z.array(TxPartInput).max(10),
  isPlanned: z.boolean().optional(),
  isShared: z.boolean().optional(),
  note: TxNote.nullable().optional(),
  origin: z.enum(['quick_add', 'edit_form', 'import']),
  suggestion: z.enum(['kept', 'changed']).optional(),
});
export type TransactionCreate = z.input<typeof TransactionCreate>;

export const TransactionPatch = z.object({
  expectedVersion: z.number().int().min(1),
  date: LocalDate.optional(),
  amountMinor: TxAmountMinor.optional(),
  label: TxLabel.optional(),
  payer: Payer.optional(),
  paymentMethod: PaymentMethod.optional(),
  parts: z.array(TxPartInput).max(10).optional(),
  isPlanned: z.boolean().optional(),
  isShared: z.boolean().optional(),
  note: TxNote.nullable().optional(),
});
export type TransactionPatch = z.input<typeof TransactionPatch>;

export const TxPartView = z.object({
  id: z.uuid(),
  lineId: z.uuid().nullable(),
  subItemId: z.uuid().nullable(),
  amountMinor: SignedAmountMinor,
  needsReview: z.boolean(),
});
export type TxPartView = z.infer<typeof TxPartView>;

export const FullTransactionView = z.object({
  private: z.literal(false),
  id: z.uuid(),
  monthStart: LocalDate,
  date: LocalDate,
  amountMinor: SignedAmountMinor,
  currency: z.string(),
  isRefund: z.boolean(),
  label: z.string(),
  payer: Payer,
  paymentMethod: PaymentMethod,
  isPlanned: z.boolean(),
  isShared: z.boolean(),
  note: z.string().nullable(),
  parts: z.array(TxPartView),
  receipts: z.array(z.object({ id: z.uuid(), createdAt: z.iso.datetime() })),
  origin: TxOrigin,
  recurringRuleId: z.uuid().nullable(),
  version: z.number().int(),
  createdAt: z.iso.datetime(),
  createdBy: PersonRef.nullable(),
  updatedAt: z.iso.datetime(),
  updatedBy: PersonRef.nullable(),
  can: z.object({ edit: z.boolean(), delete: z.boolean() }),
});
export type FullTransactionView = z.infer<typeof FullTransactionView>;

/** Another member's transaction on their private line: no label, amount, note, parts or receipts. */
export const PrivateTransactionView = z.object({
  private: z.literal(true),
  id: z.uuid(),
  monthStart: LocalDate,
  date: LocalDate,
  ownerMembershipId: z.uuid(),
});
export type PrivateTransactionView = z.infer<typeof PrivateTransactionView>;

export const TransactionView = z.discriminatedUnion('private', [FullTransactionView, PrivateTransactionView]);
export type TransactionView = z.infer<typeof TransactionView>;

export const MonthTransactionsView = z.object({
  monthStart: LocalDate,
  revision: z.string(),
  transactions: z.array(TransactionView),
});
export type MonthTransactionsView = z.infer<typeof MonthTransactionsView>;

export const PaidAsPlannedRequest = z.object({ txnId: z.uuid() });
export type PaidAsPlannedRequest = z.infer<typeof PaidAsPlannedRequest>;

export const DeleteTransactionQuery = z.object({ expectedVersion: z.coerce.number().int().min(1) });

/** Receipt photos (R10). */
export const RECEIPT_MAX_BYTES = 1_048_576;
export const RECEIPTS_PER_TRANSACTION = 3;
