import { Inject, Injectable } from '@nestjs/common';
import type {
  BudgetDetail,
  EventsResponse,
  MembersResponse,
  MemberView,
} from '@two-cents/shared/contracts';
import { isIncludedInMonth, type BudgetMonth } from '@two-cents/shared/domain';
import {
  CLOCK,
  type Clock,
  EVENT_PUBLISHER,
  type EventPublisher,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import {
  type AssignableRole,
  Membership,
} from '../../domain/entities/membership';
import {
  BUDGET_REPOSITORY,
  type BudgetRepository,
  INCOME_REPOSITORY,
  type IncomeRepository,
  MEMBERSHIP_EVENT_LOG,
  type MembershipEventLog,
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../domain/ports/repositories';
import { USER_DIRECTORY, type UserDirectory } from '../ports';
import { BudgetAccess } from '../services/budget-access';
import { BudgetViews } from '../services/budget-views';
import { MembershipEvents } from '../services/membership-events';

/** The target of a member action, loaded under the budget lock (R11). */
async function loadTarget(
  memberships: MembershipRepository,
  budgetId: string,
  membershipId: string,
): Promise<Membership> {
  const target = await memberships.findById(membershipId);
  if (!target || target.budgetId !== budgetId)
    throw new DomainError('NOT_FOUND');
  return target;
}

/** Turns a STALE_STATE from the domain into one that carries the current members (R11). */
async function withCurrentState<T>(
  work: () => Promise<T>,
  current: () => Promise<unknown>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DomainError && error.code === 'STALE_STATE')
      throw new DomainError('STALE_STATE', { current: await current() });
    throw error;
  }
}

@Injectable()
export class ListMembers {
  constructor(
    private readonly access: BudgetAccess,
    private readonly views: BudgetViews,
  ) {}

  async execute(auth: AuthContext, budgetId: string): Promise<MembersResponse> {
    const { budget, membership } = await this.access.resolve(
      budgetId,
      auth.userId,
    );
    return this.views.people(budget, membership);
  }
}

/** US5: Admin, Member or Viewer for any non-owner (FR-027). */
@Injectable()
export class ChangeRole {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(INCOME_REPOSITORY) private readonly incomes: IncomeRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: MembershipEvents,
    private readonly views: BudgetViews,
  ) {}

  execute(
    auth: AuthContext,
    budgetId: string,
    membershipId: string,
    role: AssignableRole,
  ): Promise<MemberView> {
    return withCurrentState(
      () =>
        this.tx.run(async () => {
          const { budget, membership: me } = await this.access.require(
            budgetId,
            auth.userId,
            'members.manage',
            { forUpdate: true },
          );
          const target = await loadTarget(
            this.memberships,
            budgetId,
            membershipId,
          );
          const fromRole = target.role;
          target.changeRole(me.role, role);
          if (fromRole !== role) {
            await this.memberships.save(target);
            await this.events.record(
              budgetId,
              'role_changed',
              auth.userId,
              target.id,
              {
                fromRole,
                toRole: role,
              },
            );
          }
          const user = (await this.users.findByIds([target.userId!])).get(
            target.userId!,
          );
          if (!user) throw new DomainError('STALE_STATE');
          const income = (
            await this.incomes.listForMonth(
              [target.id],
              budget.currentMonth(this.clock.now()).start,
            )
          ).get(target.id);
          return this.views.memberView(target, user, income, me);
        }),
      () => this.currentMembers(auth, budgetId),
    );
  }

  private async currentMembers(auth: AuthContext, budgetId: string) {
    const { budget, membership } = await this.access.resolve(
      budgetId,
      auth.userId,
    );
    return this.views.people(budget, membership);
  }
}

/** US5: removal by the owner or an Admin; immediate loss of access (FR-029, FR-031). */
@Injectable()
export class RemoveMember {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: MembershipEvents,
    private readonly views: BudgetViews,
  ) {}

  execute(
    auth: AuthContext,
    budgetId: string,
    membershipId: string,
  ): Promise<void> {
    return withCurrentState(
      () =>
        this.tx.run(async () => {
          const { budget, membership: me } = await this.access.require(
            budgetId,
            auth.userId,
            'members.manage',
            { forUpdate: true },
          );
          const target = await loadTarget(
            this.memberships,
            budgetId,
            membershipId,
          );
          const user = target.userId
            ? (await this.users.findByIds([target.userId])).get(target.userId)
            : undefined;
          target.removeBy(me.role, user?.firstName ?? '', this.clock.now());
          await this.memberships.save(target);
          await this.events.record(
            budgetId,
            'removed',
            auth.userId,
            target.id,
            {
              fromRole: target.role,
            },
          );
          if (target.userId)
            await this.publisher.publish('member.removed', {
              budgetName: budget.name,
              recipientUserId: target.userId,
            });
        }),
      async () => {
        const { budget, membership } = await this.access.resolve(
          budgetId,
          auth.userId,
        );
        return this.views.people(budget, membership);
      },
    );
  }
}

/** US5: any non-owner leaves; the owner must transfer or delete first (FR-030). */
@Injectable()
export class LeaveBudget {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: MembershipEvents,
  ) {}

  execute(auth: AuthContext, budgetId: string): Promise<void> {
    return this.tx.run(async () => {
      const { membership } = await this.access.resolve(budgetId, auth.userId, {
        forUpdate: true,
      });
      const fromRole = membership.role;
      membership.leave(auth.firstName, this.clock.now());
      await this.memberships.save(membership);
      await this.events.record(budgetId, 'left', auth.userId, membership.id, {
        fromRole,
      });
    });
  }
}

/** US5: only the owner; the previous owner becomes an Admin; still exactly one owner (FR-003, FR-028). */
@Injectable()
export class TransferOwnership {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    private readonly events: MembershipEvents,
    private readonly views: BudgetViews,
  ) {}

  async execute(
    auth: AuthContext,
    budgetId: string,
    toMembershipId: string,
  ): Promise<BudgetDetail> {
    const { budget, me } = await withCurrentState(
      () =>
        this.tx.run(async () => {
          const { budget, membership: me } = await this.access.require(
            budgetId,
            auth.userId,
            'ownership.transfer',
            { forUpdate: true },
          );
          const target = await loadTarget(
            this.memberships,
            budgetId,
            toMembershipId,
          );
          const targetRole = target.role;
          Membership.transferOwnership(me, target);
          // The previous owner steps down first so the "one owner" index always holds.
          await this.memberships.save(me);
          await this.memberships.save(target);
          await this.events.record(
            budgetId,
            'ownership_transferred',
            auth.userId,
            target.id,
            {
              fromRole: targetRole,
              toRole: 'owner',
            },
          );
          return { budget, me };
        }),
      async () => {
        const { budget, membership } = await this.access.resolve(
          budgetId,
          auth.userId,
        );
        return this.views.people(budget, membership);
      },
    );
    return this.views.detail(budget, me);
  }
}

const EVENTS_PAGE = 50;

/** FR-034: who did what and when, for the owner and Admins. */
@Injectable()
export class ListEvents {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(MEMBERSHIP_EVENT_LOG) private readonly log: MembershipEventLog,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
  ) {}

  async execute(
    auth: AuthContext,
    budgetId: string,
    cursor?: string,
  ): Promise<EventsResponse> {
    await this.access.require(budgetId, auth.userId, 'members.manage');
    const events = await this.log.list(budgetId, {
      before: cursor,
      limit: EVENTS_PAGE + 1,
    });
    const page = events.slice(0, EVENTS_PAGE);
    const members = new Map(
      (await this.memberships.listByBudget(budgetId)).map((m) => [m.id, m]),
    );
    const userIds = new Set<string>();
    for (const e of page) if (e.actorUserId) userIds.add(e.actorUserId);
    for (const m of members.values()) if (m.userId) userIds.add(m.userId);
    const users = await this.users.findByIds([...userIds]);
    const nameOf = (m: Membership | undefined) =>
      m
        ? ((m.isCurrent && m.userId
            ? users.get(m.userId)?.firstName
            : m.displayNameSnapshot) ?? null)
        : null;
    return {
      events: page.map((e) => ({
        id: e.id,
        type: e.type,
        actorName: e.actorUserId
          ? (users.get(e.actorUserId)?.firstName ?? null)
          : null,
        targetName: e.targetMembershipId
          ? nameOf(members.get(e.targetMembershipId))
          : null,
        details: e.details,
        createdAt: e.createdAt.toISOString(),
      })),
      nextCursor: events.length > EVENTS_PAGE ? page[page.length - 1].id : null,
    };
  }
}

/**
 * Who counts in a budget month (FR-033): used by later budgeting features for shares, and here to
 * validate income months. Someone who left mid-month stays in that month only.
 */
@Injectable()
export class MonthParticipants {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
  ) {}

  async execute(budgetId: string, month: BudgetMonth): Promise<Membership[]> {
    const budget = await this.budgets.findById(budgetId);
    if (!budget) return [];
    return (await this.memberships.listByBudget(budgetId)).filter((m) =>
      isIncludedInMonth(m.forMonth(budget.timeZone), month),
    );
  }
}
