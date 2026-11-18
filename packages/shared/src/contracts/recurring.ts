import { z } from 'zod';
import { AmountMinor, LocalDate } from './budgets';
import { Payer, PaymentMethod, TxLabel } from './transactions';

/** Spec 004: recurring transactions (contracts/rest-api.md "Recurring transactions"). */

const PositiveAmount = AmountMinor.refine((s) => BigInt(s) > 0n && BigInt(s) <= 100_000_000n, 'amount out of range');

export const RecurringRuleCreate = z.object({
  label: TxLabel,
  amountMinor: PositiveAmount,
  dayOfMonth: z.number().int().min(1).max(31),
  payer: Payer,
  paymentMethod: PaymentMethod,
  seriesId: z.uuid().nullable(),
  isShared: z.boolean().default(false),
  startsOn: LocalDate,
});
export type RecurringRuleCreate = z.input<typeof RecurringRuleCreate>;

export const RecurringRulePatch = z.object({
  expectedVersion: z.number().int().min(1),
  label: TxLabel.optional(),
  amountMinor: PositiveAmount.optional(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  payer: Payer.optional(),
  paymentMethod: PaymentMethod.optional(),
  seriesId: z.uuid().nullable().optional(),
  isShared: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type RecurringRulePatch = z.input<typeof RecurringRulePatch>;

export const RecurringRuleView = z.object({
  id: z.uuid(),
  label: z.string(),
  amountMinor: AmountMinor,
  dayOfMonth: z.number().int(),
  payer: Payer,
  paymentMethod: PaymentMethod,
  seriesId: z.uuid().nullable(),
  lineLabel: z.string().nullable(),
  isShared: z.boolean(),
  active: z.boolean(),
  startsOn: LocalDate,
  nextOccurrence: LocalDate.nullable(),
  version: z.number().int(),
});
export type RecurringRuleView = z.infer<typeof RecurringRuleView>;

export const RecurringRuleList = z.object({ rules: z.array(RecurringRuleView) });
export type RecurringRuleList = z.infer<typeof RecurringRuleList>;
