import { z } from 'zod';
import { AmountMinor, LocalDate, PersonRef, SignedAmountMinor } from './budgets';
import { IncomeLineView } from './income';
import { LineView } from './lines';

/** Spec 003: months (contracts/rest-api.md "Months"). */

export const MonthStatus = z.enum(['draft', 'active', 'closed']);
export type MonthStatus = z.infer<typeof MonthStatus>;

export const MonthAction = z.enum(['activate', 'close', 'reopen']);
export type MonthAction = z.infer<typeof MonthAction>;

export const MonthSource = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('previous') }),
  z.object({ kind: z.literal('month'), monthStart: LocalDate, includeOneOff: z.boolean().default(false) }),
  z.object({ kind: z.literal('template'), templateId: z.uuid() }),
  z.object({ kind: z.literal('scratch') }),
]);
export type MonthSource = z.input<typeof MonthSource>;

export const CreateMonthRequest = z.object({ periodStart: LocalDate, source: MonthSource });
export type CreateMonthRequest = z.input<typeof CreateMonthRequest>;

export const ChangeStatusRequest = z.object({ action: MonthAction });
export type ChangeStatusRequest = z.infer<typeof ChangeStatusRequest>;

export const MemberSummaryView = z.object({
  membershipId: z.uuid(),
  countedIncomeMinor: AmountMinor,
  otherIncomeMinor: AmountMinor,
  diMinor: AmountMinor,
  dcrMinor: AmountMinor,
  dceMinor: AmountMinor,
  whatsLeftMinor: SignedAmountMinor,
  transferMinor: AmountMinor,
  savingsMinor: AmountMinor,
  savingsRatePermille: z.number().int().nullable(),
  overrun: z.boolean(),
});
export type MemberSummaryView = z.infer<typeof MemberSummaryView>;

export const MonthSummaryView = z.object({
  members: z.array(MemberSummaryView),
  household: z.object({
    countedIncomeMinor: AmountMinor,
    otherIncomeMinor: AmountMinor,
    plannedMinor: AmountMinor,
    whatsLeftMinor: SignedAmountMinor,
    transferMinor: AmountMinor,
    savingsMinor: AmountMinor,
  }),
});
export type MonthSummaryView = z.infer<typeof MonthSummaryView>;

/** Filled by feature 04 (transactions); null until then (research R12). */
export const ActualsView = z.object({
  lines: z.array(z.object({ lineId: z.uuid(), actualMinor: AmountMinor })),
  members: z.array(z.object({ membershipId: z.uuid(), actualMinor: AmountMinor })),
});
export type ActualsView = z.infer<typeof ActualsView>;

export const PrivateAggregateView = z.object({
  membershipId: z.uuid(),
  totalMinor: AmountMinor,
  savingsMinor: AmountMinor,
  count: z.number().int().positive(),
});
export type PrivateAggregateView = z.infer<typeof PrivateAggregateView>;

export const MonthMemberView = PersonRef.extend({ isMe: z.boolean(), order: z.number().int() });
export type MonthMemberView = z.infer<typeof MonthMemberView>;

export const MonthDetail = z.object({
  month: z.object({
    start: LocalDate,
    end: LocalDate,
    status: MonthStatus,
    revision: z.string(),
    createdFrom: z.enum(['previous', 'month', 'template', 'scratch', 'import', 'income']),
    activatedAt: z.iso.datetime().nullable(),
    closedAt: z.iso.datetime().nullable(),
  }),
  currency: z.string(),
  members: z.array(MonthMemberView),
  incomes: z.array(IncomeLineView),
  lines: z.array(LineView),
  privateAggregates: z.array(PrivateAggregateView),
  summary: MonthSummaryView,
  actuals: ActualsView.nullable(),
  flags: z.object({
    incomesToConfirm: z.array(z.uuid()),
    linesNeedReview: z.array(z.uuid()),
    linesNeedIncome: z.array(z.uuid()),
  }),
  can: z.object({
    editShared: z.boolean(),
    changeStatus: z.array(MonthAction),
  }),
});
export type MonthDetail = z.infer<typeof MonthDetail>;

export const MonthListItem = z.object({
  start: LocalDate,
  end: LocalDate,
  status: MonthStatus,
  members: z.array(
    z.object({ membershipId: z.uuid(), whatsLeftMinor: SignedAmountMinor, overrun: z.boolean() }),
  ),
});
export type MonthListItem = z.infer<typeof MonthListItem>;

export const ListMonthsResponse = z.object({
  months: z.array(MonthListItem),
  nextCursor: z.string().nullable(),
});
export type ListMonthsResponse = z.infer<typeof ListMonthsResponse>;

export const ChangeCause = z.enum(['user', 'propagation', 'recompute', 'import', 'system']);
export const ChangeEntity = z.enum(['line', 'income', 'month', 'order']);
export const ChangeAction = z.enum([
  'created',
  'updated',
  'deleted',
  'reordered',
  'activated',
  'closed',
  'reopened',
  'confirmed',
]);

export const ChangeView = z.object({
  id: z.uuid(),
  at: z.iso.datetime(),
  actor: PersonRef.nullable(),
  cause: ChangeCause,
  entity: ChangeEntity,
  action: ChangeAction,
  /** True: label and changes are omitted for anyone but the line's owner (FR-035). */
  private: z.boolean(),
  label: z.string().nullable(),
  changes: z.array(z.object({ field: z.string(), old: z.string().nullable(), new: z.string().nullable() })),
});
export type ChangeView = z.infer<typeof ChangeView>;

export const HistoryResponse = z.object({ changes: z.array(ChangeView), nextCursor: z.string().nullable() });
export type HistoryResponse = z.infer<typeof HistoryResponse>;
