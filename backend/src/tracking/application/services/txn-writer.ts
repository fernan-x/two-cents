import { Inject, Injectable } from '@nestjs/common';
import { can, type Permission } from '@two-cents/shared/domain';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import type { Budget } from '../../../budgets/domain/entities/budget';
import type { Membership } from '../../../budgets/domain/entities/membership';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import { diff } from '../../../planning/application/services/history';
import {
  type MonthContext,
  MonthWriter,
} from '../../../planning/application/services/month-writer';
import type { BudgetMonth } from '../../../planning/domain/entities/budget-month';
import {
  CHANGE_LOG,
  type ChangeCause,
  type ChangeLog,
  type ChangeRecord,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../../planning/domain/ports/repositories';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import { type TxnRecord, txnSnapshot } from '../../domain/entities/transaction';

type Snapshot = Record<string, string | null>;

/**
 * The single path for transaction writes (research R4, R13): the 003 `MonthWriter` guarantees
 * (month row locked, Closed refused, one revision bump, history) plus spec 004 errors that tell
 * the app what it may do next (`canCreate`, `canReopen`).
 */
@Injectable()
export class TxnWriter {
  constructor(
    private readonly access: BudgetAccess,
    private readonly writer: MonthWriter,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(CHANGE_LOG) private readonly changes: ChangeLog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /** The budget month (start date) holding `date`, with the caller's access checked. */
  async locate(
    auth: AuthContext,
    budgetId: string,
    date: string,
    permission: Permission = 'transactions.write',
  ): Promise<{ budget: Budget; me: Membership; monthStart: string }> {
    const { budget, membership } = await this.access.require(
      budgetId,
      auth.userId,
      permission,
    );
    return { budget, me: membership, monthStart: budget.monthOf(date).start };
  }

  async run<T, R = T>(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    work: (ctx: MonthContext) => Promise<T>,
    result?: (ctx: MonthContext, value: T) => Promise<R>,
    options: { allowClosed?: boolean; permission?: Permission } = {},
  ): Promise<R> {
    try {
      return await this.writer.run(
        auth,
        budgetId,
        monthStart,
        options.permission ?? 'transactions.write',
        work,
        { allowClosed: options.allowClosed },
        result,
      );
    } catch (e) {
      throw await this.explain(e, auth, budgetId, monthStart);
    }
  }

  /** Adds what the app needs to offer "create the month" / "reopen the month" (FR-016, FR-044). */
  private async explain(
    e: unknown,
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
  ): Promise<unknown> {
    if (!(e instanceof DomainError)) return e;
    if (e.code !== 'MONTH_NOT_FOUND' && e.code !== 'MONTH_CLOSED') return e;
    if (e.details.periodStart || e.details.monthStart) return e;
    const { membership } = await this.access.require(
      budgetId,
      auth.userId,
      'budget.read',
    );
    return e.code === 'MONTH_NOT_FOUND'
      ? new DomainError('MONTH_NOT_FOUND', {
          periodStart: monthStart,
          canCreate: can(membership.role, 'months.create'),
        })
      : new DomainError('MONTH_CLOSED', {
          monthStart,
          canReopen: can(membership.role, 'months.reopen'),
        });
  }

  /** Locks another month of the budget inside the current write (moving a transaction). */
  async lockOther(budgetId: string, monthStart: string): Promise<BudgetMonth> {
    const month = await this.months.findByStart(budgetId, monthStart, {
      forUpdate: true,
    });
    if (!month) throw new DomainError('MONTH_NOT_FOUND');
    month.assertWritable();
    return month;
  }

  async bump(month: BudgetMonth): Promise<void> {
    await this.months.bumpRevision(month.id);
  }

  /** History entry for a transaction; private when it sits on a private line (FR-020). */
  async record(
    ctx: MonthContext,
    txn: TxnRecord,
    action: 'created' | 'updated' | 'deleted',
    before: Snapshot | null,
    after: Snapshot | null,
    options: { month?: BudgetMonth; cause?: ChangeCause } = {},
  ): Promise<void> {
    const privateLine = ctx.lines.find(
      (l) => l.isPrivate && txn.parts.some((p) => p.lineId === l.id),
    );
    const entry: ChangeRecord = {
      id: this.ids.next(),
      monthId: (options.month ?? ctx.month).id,
      actorMembershipId: options.cause === 'recurring' ? null : ctx.me.id,
      cause: options.cause ?? 'user',
      entity: 'transaction',
      entityId: txn.id,
      action,
      isPrivate: !!privateLine,
      ownerMembershipId: privateLine?.ownerMembershipId ?? null,
      labelSnapshot: txn.label,
      changes: diff(before, after),
      monthStatus: (options.month ?? ctx.month).status,
      createdAt: this.clock.now(),
    };
    await this.changes.record(entry);
  }

  snapshot = txnSnapshot;
}
