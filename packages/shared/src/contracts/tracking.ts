import { z } from 'zod';
import { AmountMinor, LocalDate, PersonRef, SignedAmountMinor } from './budgets';
import { MonthStatus } from './months';

/** Spec 004: planned vs actual, balances, vouchers (contracts/rest-api.md "Tracking"). */

const Group = z.enum(['personal', 'recurring_shared', 'one_off_shared']);

export const TotalsView = z.object({
  plannedAll: AmountMinor,
  plannedTracked: AmountMinor,
  actual: SignedAmountMinor,
  difference: SignedAmountMinor,
  differencePermille: z.number().int().nullable(),
  notTrackedCount: z.number().int(),
});
export type TotalsView = z.infer<typeof TotalsView>;

export const EnvelopeView = z.object({
  spent: SignedAmountMinor,
  remaining: AmountMinor,
  over: AmountMinor,
  progressPermille: z.number().int(),
  level: z.enum(['ok', 'warning', 'over']),
  subItems: z.array(z.object({ subItemId: z.uuid(), spent: SignedAmountMinor, remaining: AmountMinor.nullable() })),
});
export type EnvelopeView = z.infer<typeof EnvelopeView>;

export const LineTrackingView = z.object({
  lineId: z.uuid(),
  group: Group,
  planned: AmountMinor,
  /** Null = not tracked (FR-023). */
  actual: SignedAmountMinor.nullable(),
  difference: SignedAmountMinor.nullable(),
  differencePermille: z.number().int().nullable(),
  txnCount: z.number().int(),
  envelope: EnvelopeView.nullable(),
});
export type LineTrackingView = z.infer<typeof LineTrackingView>;

export const SettlementCreate = z.object({
  fromMembershipId: z.uuid(),
  toMembershipId: z.uuid(),
  amountMinor: AmountMinor.refine((s) => BigInt(s) > 0n, 'amount must be positive'),
});
export type SettlementCreate = z.infer<typeof SettlementCreate>;

export const SettlementView = z.object({
  id: z.uuid(),
  from: z.uuid(),
  to: z.uuid(),
  amountMinor: AmountMinor,
  createdAt: z.iso.datetime(),
  createdBy: PersonRef.nullable(),
});
export type SettlementView = z.infer<typeof SettlementView>;

export const TrackingView = z.object({
  monthStart: LocalDate,
  status: MonthStatus,
  revision: z.string(),
  lines: z.array(LineTrackingView),
  privateAggregates: z.array(
    z.object({ membershipId: z.uuid(), plannedMinor: AmountMinor, actualMinor: SignedAmountMinor.nullable() }),
  ),
  groups: z.array(z.object({ group: Group, totals: TotalsView })),
  unassigned: z.object({ actual: SignedAmountMinor, txnCount: z.number().int(), needsReviewCount: z.number().int() }),
  month: TotalsView,
  balances: z.array(z.object({ from: z.uuid(), to: z.uuid(), amountMinor: AmountMinor })),
  settlements: z.array(SettlementView),
  vouchers: z.array(
    z.object({
      membershipId: z.uuid(),
      incomeMinor: AmountMinor,
      spentMinor: SignedAmountMinor,
      remainingMinor: SignedAmountMinor,
    }),
  ),
});
export type TrackingView = z.infer<typeof TrackingView>;
