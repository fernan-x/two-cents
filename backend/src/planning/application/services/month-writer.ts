import { Inject, Injectable } from '@nestjs/common';
import type { MonthDetail } from '@two-cents/shared/contracts';
import type { Permission, PlanMember } from '@two-cents/shared/domain';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import type { Budget } from '../../../budgets/domain/entities/budget';
import type { Membership } from '../../../budgets/domain/entities/membership';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../budgets/domain/ports/repositories';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { BudgetLine } from '../../domain/entities/budget-line';
import type { BudgetMonth } from '../../domain/entities/budget-month';
import type { IncomeLine } from '../../domain/entities/income-line';
import {
  CHANGE_LOG,
  type ChangeLog,
  type ChangeRecord,
  INCOME_LINE_REPOSITORY,
  type IncomeLineRepository,
  LINE_REPOSITORY,
  type LineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../domain/ports/repositories';
import { MonthDetailView } from './month-detail-view';
import { contributingMembers, toPlanMembers } from './plan-mapping';

export type ChangeInput = Omit<
  ChangeRecord,
  'id' | 'monthId' | 'monthStatus' | 'createdAt' | 'actorMembershipId' | 'cause'
> &
  Partial<Pick<ChangeRecord, 'actorMembershipId' | 'cause'>>;

/** Everything a month write needs, loaded under the month lock. */
export interface MonthContext {
  budget: Budget;
  me: Membership;
  month: BudgetMonth;
  /** Contributing members, in tie-break order. */
  members: Membership[];
  planMembers: PlanMember[];
  incomes: IncomeLine[];
  lines: BudgetLine[];
  now: Date;
  newId(): string;
  /** Adds a history record for this month (FR-035), actor = caller and cause `user` by default. */
  record(change: ChangeInput): Promise<void>;
}

/**
 * The single path for writes to a month (research R4, R5, R11): one transaction, the month row
 * locked, closed months refused, one revision bump, history records, and the caller's up-to-date
 * `MonthDetail` as the result.
 */
@Injectable()
export class MonthWriter {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
    @Inject(INCOME_LINE_REPOSITORY)
    private readonly incomes: IncomeLineRepository,
    @Inject(CHANGE_LOG) private readonly changes: ChangeLog,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    private readonly view: MonthDetailView,
  ) {}

  write(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    permission: Permission,
    work: (ctx: MonthContext) => Promise<void>,
    options: { allowClosed?: boolean } = {},
  ): Promise<MonthDetail> {
    return this.run(
      auth,
      budgetId,
      monthStart,
      permission,
      work,
      options,
      (ctx) => this.view.build(ctx.budget, ctx.me, ctx.month),
    );
  }

  /**
   * Same guarantees as {@link write} (lock, closed check, one revision bump, history), for writes
   * that answer with something other than `MonthDetail` (spec 004 transactions). `result` runs
   * after the revision bump, with the month reloaded.
   */
  run<T, R = T>(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    permission: Permission,
    work: (ctx: MonthContext) => Promise<T>,
    options: { allowClosed?: boolean } = {},
    result?: (ctx: MonthContext, value: T) => Promise<R>,
  ): Promise<R> {
    return this.tx.run(async () => {
      const { budget, membership } = await this.access.require(
        budgetId,
        auth.userId,
        permission,
      );
      const month = await this.months.findByStart(budgetId, monthStart, {
        forUpdate: true,
      });
      if (!month) throw new DomainError('MONTH_NOT_FOUND');
      if (!options.allowClosed) month.assertWritable();
      const ctx = await this.context(budget, membership, month);
      const value = await work(ctx);
      await this.months.save(month);
      await this.months.bumpRevision(month.id);
      const fresh = (await this.months.findById(month.id))!;
      const after = { ...ctx, month: fresh };
      return result ? result(after, value) : (value as unknown as R);
    });
  }

  /** Loads a month's context for another month inside the current transaction (propagation, sync). */
  async context(
    budget: Budget,
    me: Membership,
    month: BudgetMonth,
    cause?: ChangeRecord['cause'],
  ): Promise<MonthContext> {
    const [all, incomes, lines] = await Promise.all([
      this.memberships.listByBudget(budget.id),
      this.incomes.listForMonth(month.id),
      this.lines.listForMonth(month.id),
    ]);
    const members = contributingMembers(budget, all, month.period);
    const now = this.clock.now();
    return {
      budget,
      me,
      month,
      members,
      planMembers: toPlanMembers(members),
      incomes,
      lines,
      now,
      newId: () => this.ids.next(),
      record: (change) =>
        this.changes.record({
          actorMembershipId: me.id,
          cause: cause ?? 'user',
          ...change,
          id: this.ids.next(),
          monthId: month.id,
          monthStatus: month.status,
          createdAt: now,
        }),
    };
  }
}
