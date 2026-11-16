import { z } from 'zod';
import { AvatarKey, ColorKey, CurrencyCode } from './common';

/** Spec 002: budgets, members and income (contracts/rest-api.md). */

export const Role = z.enum(['owner', 'admin', 'member', 'viewer']);
export type Role = z.infer<typeof Role>;

export const LocalDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

/** Exact money: an integer number of minor units sent as a string, never a float (Principle I). */
export const AmountMinor = z.string().regex(/^\d{1,18}$/, 'integer number of minor units');
export const Money = z.object({ amountMinor: AmountMinor, currency: CurrencyCode });
export type Money = z.infer<typeof Money>;

export const BudgetMonth = z.object({ start: LocalDate, end: LocalDate });
export type BudgetMonth = z.infer<typeof BudgetMonth>;

/** 1–60 characters after trimming, NFC-normalized (FR-001). */
export const BudgetName = z
  .string()
  .transform((s) => s.normalize('NFC').trim())
  .pipe(
    z
      .string()
      .min(1, 'name required')
      .refine((s) => [...s].length <= 60, 'at most 60 characters'),
  );

export const MonthStartDay = z.number().int().min(1).max(28);

export const TimeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, 'IANA time zone');

export const CreateBudgetRequest = z.object({
  name: BudgetName,
  currency: CurrencyCode.default('EUR'),
  monthStartDay: MonthStartDay.default(1),
  timeZone: TimeZone,
});
export type CreateBudgetRequest = z.input<typeof CreateBudgetRequest>;

export const UpdateBudgetRequest = z
  .object({ name: BudgetName, monthStartDay: MonthStartDay, currency: CurrencyCode })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'at least one field');
export type UpdateBudgetRequest = z.input<typeof UpdateBudgetRequest>;

/** Must equal the budget name exactly (FR-037). Not trimmed. */
export const DeleteBudgetRequest = z.object({ confirmName: z.string() });
export type DeleteBudgetRequest = z.infer<typeof DeleteBudgetRequest>;

/** A person in history. `displayName` is null for a deleted account, shown as "Ancien membre". */
export const PersonRef = z.object({
  membershipId: z.uuid(),
  displayName: z.string().nullable(),
  formerMember: z.boolean(),
});
export type PersonRef = z.infer<typeof PersonRef>;

export const MemberView = z.object({
  membershipId: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  avatarKey: AvatarKey,
  colorKey: ColorKey,
  role: Role,
  joinedAt: z.iso.datetime(),
  isMe: z.boolean(),
  /** Visible to everyone in the budget (clarification Q2). Null for viewers or when not entered. */
  currentMonthIncome: Money.nullable(),
});
export type MemberView = z.infer<typeof MemberView>;

export const BudgetSummary = z.object({
  id: z.uuid(),
  name: z.string(),
  currency: CurrencyCode,
  myRole: Role,
  memberCount: z.number().int().positive(),
  lastOpenedAt: z.iso.datetime().nullable(),
});
export type BudgetSummary = z.infer<typeof BudgetSummary>;

export const BudgetDetail = BudgetSummary.extend({
  monthStartDay: MonthStartDay,
  timeZone: z.string(),
  currentMonth: BudgetMonth,
  /** A start-day change waiting for the next budget month (FR-005). */
  pendingMonthStartDay: z.object({ startDay: MonthStartDay, effectiveFrom: LocalDate }).nullable(),
  members: z.array(MemberView),
  /** The caller should be reminded to enter their income for the current month (FR-025). */
  myIncomeMissing: z.boolean(),
  /** The currency can no longer change: amounts exist (FR-006). */
  currencyLocked: z.boolean(),
});
export type BudgetDetail = z.infer<typeof BudgetDetail>;

/** A budget the caller deleted, restorable until `purgeAt` (FR-038a). */
export const DeletedBudget = z.object({
  id: z.uuid(),
  name: z.string(),
  deletedAt: z.iso.datetime(),
  purgeAt: z.iso.datetime(),
});
export type DeletedBudget = z.infer<typeof DeletedBudget>;

export const MyBudgetsResponse = z.object({
  budgets: z.array(BudgetSummary),
  recentlyDeleted: z.array(DeletedBudget),
});
export type MyBudgetsResponse = z.infer<typeof MyBudgetsResponse>;
