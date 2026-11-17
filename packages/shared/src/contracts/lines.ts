import { z } from 'zod';
import { AmountMinor, TrimmedText } from './budgets';

/** Spec 003: budget lines (contracts/rest-api.md "Lines"). */

export const Group = z.enum(['personal', 'recurring_shared', 'one_off_shared']);
export type Group = z.infer<typeof Group>;

export const Kind = z.enum(['expense', 'savings']);
export type Kind = z.infer<typeof Kind>;

export const SplitMode = z.enum(['custom', 'equal', 'proportional', 'one_payer']);
export type SplitMode = z.infer<typeof SplitMode>;

export const Scope = z.enum(['from_this_month_on', 'this_month_only']);
export type Scope = z.infer<typeof Scope>;

export const Formula = z.object({
  kind: z.enum(['per_year', 'per_half_year', 'per_quarter', 'times']),
  baseMinor: AmountMinor,
  factor: z.number().int().min(1).max(99),
});
export type Formula = z.infer<typeof Formula>;

export const ShareInput = z.object({ membershipId: z.uuid(), amountMinor: AmountMinor });
export type ShareInput = z.infer<typeof ShareInput>;

export const LineLabel = TrimmedText(1, 60);
export const SubItemLabel = TrimmedText(1, 40);

export const SubItemInput = z.object({
  label: SubItemLabel,
  amountMinor: AmountMinor.nullable().optional(),
});
export type SubItemInput = z.infer<typeof SubItemInput>;

/** Either a total (or a formula giving it), or per-member shares (FR-020). */
export const LineAmountInput = z.discriminatedUnion('entry', [
  z
    .object({ entry: z.literal('total'), totalMinor: AmountMinor.optional(), formula: Formula.optional() })
    .refine((v) => (v.totalMinor === undefined) !== (v.formula === undefined), 'exactly one of totalMinor or formula'),
  z.object({
    entry: z.literal('shares'),
    shares: z.array(ShareInput).min(1).max(6),
    totalMinor: AmountMinor.optional(),
  }),
]);
export type LineAmountInput = z.infer<typeof LineAmountInput>;

export const SplitInput = z.object({ mode: SplitMode, payerMembershipId: z.uuid().optional() });
export type SplitInput = z.infer<typeof SplitInput>;

export const CreateLineRequest = z.object({
  group: Group,
  kind: Kind.default('expense'),
  label: LineLabel,
  categoryId: z.uuid().nullable().optional(),
  isEnvelope: z.boolean().default(false),
  subItems: z.array(SubItemInput).max(30).optional(),
  /** Personal lines: must be the caller. */
  ownerMembershipId: z.uuid().optional(),
  /** Personal lines only (FR-019). */
  isPrivate: z.boolean().default(false),
  /** Shared lines only; default custom. */
  split: SplitInput.optional(),
  amount: LineAmountInput,
});
export type CreateLineRequest = z.input<typeof CreateLineRequest>;

export const UpdateLineRequest = z.object({
  expectedVersion: z.number().int().min(1),
  group: Group.optional(),
  kind: Kind.optional(),
  label: LineLabel.optional(),
  categoryId: z.uuid().nullable().optional(),
  isEnvelope: z.boolean().optional(),
  subItems: z.array(SubItemInput).max(30).optional(),
  ownerMembershipId: z.uuid().optional(),
  isPrivate: z.boolean().optional(),
  split: SplitInput.optional(),
  amount: LineAmountInput.optional(),
  /** Required when amount fields of a recurring line change (FR-024). */
  scope: Scope.optional(),
});
export type UpdateLineRequest = z.input<typeof UpdateLineRequest>;

export const ReorderLinesRequest = z.object({
  group: Group,
  ownerMembershipId: z.uuid().optional(),
  lineIds: z.array(z.uuid()).max(200),
});
export type ReorderLinesRequest = z.infer<typeof ReorderLinesRequest>;

export const LineView = z.object({
  id: z.uuid(),
  seriesId: z.uuid(),
  group: Group,
  kind: Kind,
  label: z.string(),
  categoryId: z.uuid().nullable(),
  isEnvelope: z.boolean(),
  subItems: z.array(z.object({ id: z.uuid(), label: z.string(), amountMinor: AmountMinor.nullable() })),
  ownerMembershipId: z.uuid().nullable(),
  isPrivate: z.boolean(),
  splitMode: SplitMode.nullable(),
  payerMembershipId: z.uuid().nullable(),
  totalMinor: AmountMinor,
  shares: z.array(ShareInput),
  formula: Formula.nullable(),
  position: z.number().int(),
  version: z.number().int(),
  isException: z.boolean(),
  usualTotalMinor: AmountMinor.nullable(),
  needsReview: z.boolean(),
  needsIncome: z.boolean(),
  editable: z.boolean(),
});
export type LineView = z.infer<typeof LineView>;
