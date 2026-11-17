import { z } from 'zod';
import { AmountMinor, TrimmedText } from './budgets';

/** Spec 002 route, kept for older app versions (003 research R13): upserts the primary income line. */
export const PutIncomeRequest = z.object({ amountMinor: AmountMinor });
export type PutIncomeRequest = z.infer<typeof PutIncomeRequest>;

/** Spec 003: income lines (contracts/rest-api.md "Incomes"). */
export const IncomeLabel = TrimmedText(1, 40);

export const CreateIncomeRequest = z.object({
  label: IncomeLabel.optional(),
  amountMinor: AmountMinor,
  countsTowardHousehold: z.boolean().default(true),
});
export type CreateIncomeRequest = z.input<typeof CreateIncomeRequest>;

export const UpdateIncomeRequest = z.object({
  expectedVersion: z.number().int().min(1),
  label: IncomeLabel.nullable().optional(),
  amountMinor: AmountMinor.optional(),
  countsTowardHousehold: z.boolean().optional(),
});
export type UpdateIncomeRequest = z.input<typeof UpdateIncomeRequest>;

export const IncomeLineView = z.object({
  id: z.uuid(),
  membershipId: z.uuid(),
  /** Null = the default "Revenu" label, translated in the app. */
  label: z.string().nullable(),
  amountMinor: AmountMinor,
  countsTowardHousehold: z.boolean(),
  toConfirm: z.boolean(),
  isPrimary: z.boolean(),
  position: z.number().int(),
  version: z.number().int(),
  editable: z.boolean(),
});
export type IncomeLineView = z.infer<typeof IncomeLineView>;
