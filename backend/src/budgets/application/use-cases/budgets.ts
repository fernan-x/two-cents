import { Inject, Injectable } from '@nestjs/common';
import type {
  BudgetDetail,
  MyBudgetsResponse,
} from '@two-cents/shared/contracts';
import {
  CLOCK,
  type Clock,
  EVENT_PUBLISHER,
  type EventPublisher,
  ID_GENERATOR,
  type IdGenerator,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import { Budget, RESTORE_WINDOW_MS } from '../../domain/entities/budget';
import { Membership } from '../../domain/entities/membership';
import {
  BUDGET_REPOSITORY,
  type BudgetRepository,
  INCOME_REPOSITORY,
  type IncomeRepository,
  INVITATION_REPOSITORY,
  type InvitationRepository,
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../domain/ports/repositories';
import { BudgetName } from '../../domain/value-objects/budget-name';
import { toCurrency } from '../../domain/value-objects/currency';
import { MonthStartDay } from '../../domain/value-objects/month-start-day';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import { BudgetAccess } from '../services/budget-access';
import { BudgetViews } from '../services/budget-views';
import { MembershipEvents } from '../services/membership-events';

export interface CreateBudgetInput {
  name: string;
  currency: string;
  monthStartDay: number;
  timeZone: string;
}

/** US1: create a budget; the creator becomes its owner (FR-001, FR-002). */
@Injectable()
export class CreateBudget {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: MembershipEvents,
    private readonly views: BudgetViews,
  ) {}

  async execute(
    auth: AuthContext,
    input: CreateBudgetInput,
  ): Promise<BudgetDetail> {
    const now = this.clock.now();
    const budget = Budget.create({
      id: this.ids.next(),
      name: BudgetName.create(input.name),
      currency: toCurrency(input.currency),
      startDay: MonthStartDay.create(input.monthStartDay),
      timeZone: input.timeZone,
      createdBy: auth.userId,
      now,
    });
    const owner = Membership.join({
      id: this.ids.next(),
      budgetId: budget.id,
      userId: auth.userId,
      role: 'owner',
      now,
    });
    await this.tx.run(async () => {
      await this.budgets.save(budget);
      await this.memberships.save(owner);
      await this.events.record(
        budget.id,
        'budget_created',
        auth.userId,
        owner.id,
      );
    });
    return this.views.detail(budget, owner);
  }
}

@Injectable()
export class GetBudget {
  constructor(
    private readonly access: BudgetAccess,
    private readonly views: BudgetViews,
  ) {}

  async execute(auth: AuthContext, budgetId: string): Promise<BudgetDetail> {
    const { budget, membership } = await this.access.resolve(
      budgetId,
      auth.userId,
    );
    return this.views.detail(budget, membership);
  }
}

/** US3: the picker, most recently opened first (FR-035, FR-036), plus "Récemment supprimés" (FR-038a). */
@Injectable()
export class ListMyBudgets {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly views: BudgetViews,
  ) {}

  async execute(auth: AuthContext): Promise<MyBudgetsResponse> {
    const now = this.clock.now();
    const mine = await this.memberships.listCurrentByUser(auth.userId);
    const budgets = new Map(
      (await this.budgets.findByIds(mine.map((m) => m.budgetId))).map((b) => [
        b.id,
        b,
      ]),
    );
    const live = mine.filter((m) => {
      const b = budgets.get(m.budgetId);
      return b && !b.isDeleted;
    });
    const counts = await Promise.all(
      live.map((m) => this.memberships.countCurrent(m.budgetId)),
    );
    const summaries = live
      .map((m, i) => this.views.summary(budgets.get(m.budgetId)!, m, counts[i]))
      .map((summary, i) => ({ summary, membership: live[i] }))
      .sort(
        (a, b) =>
          (b.membership.lastOpenedAt?.getTime() ?? 0) -
            (a.membership.lastOpenedAt?.getTime() ?? 0) ||
          b.membership.joinedAt.getTime() - a.membership.joinedAt.getTime(),
      )
      .map((x) => x.summary);

    const ownedDeleted = mine.filter((m) => {
      const b = budgets.get(m.budgetId);
      return (
        b?.isDeleted && m.role === 'owner' && b.isRestorableBy(auth.userId, now)
      );
    });
    return {
      budgets: summaries,
      recentlyDeleted: ownedDeleted.map((m) => {
        const b = budgets.get(m.budgetId)!;
        return {
          id: b.id,
          name: b.name,
          deletedAt: b.deletedAt!.toISOString(),
          purgeAt: b.purgeAt()!.toISOString(),
        };
      }),
    };
  }
}

/** US3: remembers the last budget opened, per account so it follows across devices (FR-036). */
@Injectable()
export class OpenBudget {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(auth: AuthContext, budgetId: string): Promise<void> {
    const { membership } = await this.access.resolve(budgetId, auth.userId);
    membership.open(this.clock.now());
    await this.memberships.save(membership);
  }
}

export interface UpdateBudgetInput {
  name?: string;
  monthStartDay?: number;
  currency?: string;
}

/** US6: rename, change the start day (from the next month) or the currency (while no amounts). */
@Injectable()
export class UpdateBudgetSettings {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(INCOME_REPOSITORY) private readonly incomes: IncomeRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: MembershipEvents,
    private readonly views: BudgetViews,
  ) {}

  async execute(
    auth: AuthContext,
    budgetId: string,
    input: UpdateBudgetInput,
  ): Promise<BudgetDetail> {
    const { budget, membership } = await this.tx.run(async () => {
      const grant = await this.access.require(
        budgetId,
        auth.userId,
        'budget.settings.edit',
        { forUpdate: true },
      );
      const { budget } = grant;
      const now = this.clock.now();
      const changed: string[] = [];
      if (input.name !== undefined) {
        const before = budget.name;
        budget.rename(BudgetName.create(input.name));
        if (budget.name !== before) changed.push('name');
      }
      if (input.monthStartDay !== undefined) {
        const before = JSON.stringify(budget.rules);
        budget.changeStartDay(MonthStartDay.create(input.monthStartDay), now);
        if (JSON.stringify(budget.rules) !== before)
          changed.push('monthStartDay');
      }
      if (input.currency !== undefined && input.currency !== budget.currency) {
        budget.changeCurrency(
          toCurrency(input.currency),
          await this.incomes.existsForBudget(budget.id),
        );
        changed.push('currency');
      }
      if (changed.length > 0) {
        await this.budgets.save(budget);
        await this.events.record(
          budget.id,
          'settings_changed',
          auth.userId,
          null,
          {
            changed,
          },
        );
      }
      return grant;
    });
    return this.views.detail(budget, membership);
  }
}

/**
 * US6: only the owner, after typing the exact name (FR-037). Hidden from everyone at once, pending
 * invitations die (FR-038c), the other members are told who deleted it (FR-038).
 */
@Injectable()
export class DeleteBudget {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: MembershipEvents,
  ) {}

  async execute(
    auth: AuthContext,
    budgetId: string,
    confirmName: string,
  ): Promise<void> {
    await this.tx.run(async () => {
      const { budget } = await this.access.require(
        budgetId,
        auth.userId,
        'budget.delete',
        { forUpdate: true },
      );
      const now = this.clock.now();
      budget.delete(auth.userId, confirmName, now);
      await this.budgets.save(budget);
      await this.invitations.revokeAllPending(budget.id, auth.userId, now);
      await this.events.record(budget.id, 'budget_deleted', auth.userId);
      const others = (await this.memberships.listByBudget(budget.id))
        .filter((m) => m.isCurrent && m.userId && m.userId !== auth.userId)
        .map((m) => m.userId!);
      if (others.length > 0)
        await this.publisher.publish('budget.deleted', {
          budgetId: budget.id,
          budgetName: budget.name,
          deletedByFirstName: auth.firstName,
          restorableUntil: budget.purgeAt()!.toISOString(),
          recipientUserIds: others,
        });
    });
  }
}

/** US6: the owner who deleted it restores it within 30 days, same people and roles (FR-038a). */
@Injectable()
export class RestoreBudget {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: MembershipEvents,
    private readonly views: BudgetViews,
  ) {}

  async execute(auth: AuthContext, budgetId: string): Promise<BudgetDetail> {
    const { budget, owner } = await this.tx.run(async () => {
      const budget = await this.budgets.findByIdForUpdate(budgetId);
      const owner = await this.memberships.findCurrent(budgetId, auth.userId);
      if (!budget || !budget.isDeleted || owner?.role !== 'owner')
        throw new DomainError('BUDGET_NOT_FOUND');
      budget.restore(auth.userId, this.clock.now());
      await this.budgets.save(budget);
      await this.events.record(budget.id, 'budget_restored', auth.userId);
      const others = (await this.memberships.listByBudget(budget.id))
        .filter((m) => m.isCurrent && m.userId && m.userId !== auth.userId)
        .map((m) => m.userId!);
      if (others.length > 0)
        await this.publisher.publish('budget.restored', {
          budgetId: budget.id,
          budgetName: budget.name,
          restoredByFirstName: auth.firstName,
          recipientUserIds: others,
        });
      return { budget, owner };
    });
    return this.views.detail(budget, owner);
  }
}

/** FR-038b: budgets deleted 30 days ago or more are erased with all their data. */
@Injectable()
export class PurgeBudgets {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const cutoff = new Date(this.clock.now().getTime() - RESTORE_WINDOW_MS);
    let purged = 0;
    for (;;) {
      const ids = await this.budgets.listDeletedBefore(cutoff, 100);
      for (const id of ids) await this.budgets.purge(id);
      purged += ids.length;
      if (ids.length < 100) return purged;
    }
  }
}
