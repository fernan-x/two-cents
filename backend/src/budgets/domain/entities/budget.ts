import {
  type BudgetMonth,
  budgetMonthFor,
  type LocalDate,
  localDateIn,
  type MonthStartRule,
  planStartDayChange,
} from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { BudgetName } from '../value-objects/budget-name';
import type { MonthStartDay } from '../value-objects/month-start-day';

/** A deleted budget can be restored for 30 days, then it is purged (FR-038a, FR-038b). */
export const RESTORE_WINDOW_MS = 30 * 86_400_000;

export interface BudgetProps {
  id: string;
  name: string;
  currency: string;
  timeZone: string;
  createdAt: Date;
  createdBy: string | null;
  deletedAt: Date | null;
  deletedBy: string | null;
  rules: MonthStartRule[];
}

/** A shared space for one household (spec 002). Membership lives in `Membership`. */
export class Budget {
  private constructor(private props: BudgetProps) {}

  static create(input: {
    id: string;
    name: BudgetName;
    currency: string;
    startDay: MonthStartDay;
    timeZone: string;
    createdBy: string;
    now: Date;
  }): Budget {
    const today = localDateIn(input.now, input.timeZone);
    // The first rule starts on the first day of the current month: regular months from there.
    const firstMonth = budgetMonthFor(today, [
      { effectiveFrom: today, startDay: input.startDay.value },
    ]);
    return new Budget({
      id: input.id,
      name: input.name.value,
      currency: input.currency,
      timeZone: input.timeZone,
      createdAt: input.now,
      createdBy: input.createdBy,
      deletedAt: null,
      deletedBy: null,
      rules: [
        { effectiveFrom: firstMonth.start, startDay: input.startDay.value },
      ],
    });
  }

  static fromPersistence(props: BudgetProps): Budget {
    return new Budget({ ...props, rules: [...props.rules] });
  }

  toPersistence(): BudgetProps {
    return { ...this.props, rules: [...this.props.rules] };
  }

  get id() {
    return this.props.id;
  }
  get name() {
    return this.props.name;
  }
  get currency() {
    return this.props.currency;
  }
  get timeZone() {
    return this.props.timeZone;
  }
  get createdAt() {
    return this.props.createdAt;
  }
  get deletedAt() {
    return this.props.deletedAt;
  }
  get deletedBy() {
    return this.props.deletedBy;
  }
  get isDeleted() {
    return this.props.deletedAt !== null;
  }
  get rules(): readonly MonthStartRule[] {
    return this.props.rules;
  }

  /** The budget's calendar date at `now`, in its time zone (research R5). */
  today(now: Date): LocalDate {
    return localDateIn(now, this.props.timeZone);
  }

  currentMonth(now: Date): BudgetMonth {
    return budgetMonthFor(this.today(now), this.props.rules);
  }

  monthOf(date: LocalDate): BudgetMonth {
    return budgetMonthFor(date, this.props.rules);
  }

  /** The start day governing the current month. */
  monthStartDay(now: Date): number {
    const today = this.today(now);
    const inForce = this.props.rules.filter(
      (r, i) => i === 0 || r.effectiveFrom <= today,
    );
    return inForce[inForce.length - 1].startDay;
  }

  /** A start-day change waiting for the next month (FR-005), or null. */
  pendingStartDay(now: Date): MonthStartRule | null {
    const today = this.today(now);
    return this.props.rules.find((r) => r.effectiveFrom > today) ?? null;
  }

  rename(name: BudgetName): void {
    this.props.name = name.value;
  }

  /**
   * Takes effect from the next budget month; the current month keeps its dates (FR-005). A second
   * change before then replaces the pending one; going back to the current day cancels it.
   */
  changeStartDay(day: MonthStartDay, now: Date): void {
    const today = this.today(now);
    const inForce = this.props.rules.filter(
      (r, i) => i === 0 || r.effectiveFrom <= today,
    );
    const change = planStartDayChange(inForce, today, day.value);
    this.props.rules = change ? [...inForce, change] : inForce;
  }

  /** Only while the budget holds no amounts (FR-006). */
  changeCurrency(currency: string, hasAmounts: boolean): void {
    if (currency === this.props.currency) return;
    if (hasAmounts) throw new DomainError('CURRENCY_LOCKED');
    this.props.currency = currency;
  }

  /** The typed name must match exactly (FR-037). */
  delete(actorUserId: string, confirmName: string, now: Date): void {
    if (confirmName !== this.props.name)
      throw new DomainError('CONFIRM_NAME_MISMATCH');
    this.props.deletedAt = now;
    this.props.deletedBy = actorUserId;
  }

  /** When it will be purged, for a deleted budget. */
  purgeAt(): Date | null {
    return this.props.deletedAt
      ? new Date(this.props.deletedAt.getTime() + RESTORE_WINDOW_MS)
      : null;
  }

  /** Whether `userId` may restore it at `now` (FR-038a). */
  isRestorableBy(userId: string, now: Date): boolean {
    const purgeAt = this.purgeAt();
    return (
      purgeAt !== null &&
      this.props.deletedBy === userId &&
      now.getTime() < purgeAt.getTime()
    );
  }

  restore(actorUserId: string, now: Date): void {
    // Same answer as for a budget that doesn't exist (FR-040).
    if (!this.isRestorableBy(actorUserId, now))
      throw new DomainError('BUDGET_NOT_FOUND');
    this.props.deletedAt = null;
    this.props.deletedBy = null;
  }
}
