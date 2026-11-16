import { Inject, Injectable } from '@nestjs/common';
import { pickNewOwner } from '@two-cents/shared/domain';
import {
  CLOCK,
  type Clock,
  EVENT_PUBLISHER,
  type EventPublisher,
} from '../../../shared-kernel/application/ports';
import type {
  BudgetExportPort,
  BudgetExportRow,
  BudgetMembershipPort,
} from '../../../identity/application/ports/budgets';
import type { Budget } from '../../domain/entities/budget';
import type { Membership } from '../../domain/entities/membership';
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
import { USER_DIRECTORY, type UserDirectory } from '../ports';
import { MembershipEvents } from '../services/membership-events';

type Candidate = {
  membershipId: string;
  role: 'admin' | 'member' | 'viewer';
  joinedAt: Date;
  m: Membership;
};

const candidates = (others: Membership[]): Candidate[] =>
  others.map((m) => ({
    membershipId: m.id,
    role: m.role as Candidate['role'],
    joinedAt: m.joinedAt,
    m,
  }));

/**
 * What spec 001's account deletion and export need from budgets (001 "Ports to the budgets module",
 * 002 edge cases "Owner/Member deletes their account", R14-C2/C3).
 */
@Injectable()
export class AccountHandoff implements BudgetMembershipPort, BudgetExportPort {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(INCOME_REPOSITORY) private readonly incomes: IncomeRepository,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: MembershipEvents,
  ) {}

  async hasAnyBudget(userId: string): Promise<boolean> {
    const mine = await this.memberships.listCurrentByUser(userId);
    if (mine.length === 0) return false;
    const budgets = await this.budgets.findByIds(mine.map((m) => m.budgetId));
    return budgets.some((b) => !b.isDeleted);
  }

  async cancelInvitationsSentBy(userId: string): Promise<void> {
    await this.invitations.revokeAllSentBy(userId, this.clock.now());
  }

  async previewMemberDeletion(userId: string) {
    const result: Awaited<
      ReturnType<BudgetMembershipPort['previewMemberDeletion']>
    > = {
      budgetsDeleted: [],
      budgetsLeft: [],
    };
    for (const { budget, membership, others } of await this.currentBudgets(
      userId,
    )) {
      const ref = { id: budget.id, name: budget.name };
      if (
        budget.isDeleted ||
        (membership.role === 'owner' && others.length === 0)
      ) {
        if (membership.role === 'owner') result.budgetsDeleted.push(ref);
        continue;
      }
      if (membership.role !== 'owner') {
        result.budgetsLeft.push(ref);
        continue;
      }
      const next = pickNewOwner(candidates(others));
      const user = next?.m.userId
        ? (await this.users.findByIds([next.m.userId])).get(next.m.userId)
        : undefined;
      result.budgetsLeft.push({ ...ref, newOwnerFirstName: user?.firstName });
    }
    return result;
  }

  /**
   * Runs inside 001's deletion transaction. Budgets where the person was alone, and deleted budgets
   * they owned, are erased; ownership passes to the oldest Admin, else the oldest person; every
   * membership ends anonymously ("Ancien membre").
   */
  async finalizeMemberDeletion(userId: string): Promise<void> {
    const now = this.clock.now();
    await this.invitations.revokeAllSentBy(userId, now);
    for (const membership of await this.memberships.listAllByUser(userId)) {
      const budget = await this.budgets.findByIdForUpdate(membership.budgetId);
      if (!budget) continue;
      const others = (await this.memberships.listByBudget(budget.id)).filter(
        (m) => m.isCurrent && m.id !== membership.id,
      );
      const wasOwner = membership.isOwner;
      if (wasOwner && (budget.isDeleted || others.length === 0)) {
        await this.budgets.purge(budget.id);
        continue;
      }
      membership.endForAccountDeletion(now);
      await this.memberships.save(membership);
      if (wasOwner) await this.handOver(budget, others);
    }
  }

  async exportForUser(userId: string): Promise<BudgetExportRow> {
    const mine = await this.memberships.listAllByUser(userId);
    const budgets = new Map(
      (await this.budgets.findByIds(mine.map((m) => m.budgetId))).map((b) => [
        b.id,
        b,
      ]),
    );
    const byMembership = new Map(mine.map((m) => [m.id, m]));
    const incomes = await this.incomes.listByMemberships(mine.map((m) => m.id));
    return {
      budgets: mine.map((m) => ({
        budgetId: m.budgetId,
        budgetName: budgets.get(m.budgetId)?.name ?? null,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
        leftAt: m.leftAt?.toISOString() ?? null,
      })),
      entries: incomes.map((i) => ({
        type: 'monthly_income',
        budgetName:
          budgets.get(byMembership.get(i.membershipId)?.budgetId ?? '')?.name ??
          null,
        month: i.monthStart,
        amountMinor: i.amountMinor.toString(),
        currency: i.currency,
      })),
    };
  }

  private async handOver(budget: Budget, others: Membership[]) {
    const next = pickNewOwner(candidates(others));
    if (!next) return;
    next.m.promoteToOwner();
    await this.memberships.save(next.m);
    await this.events.record(
      budget.id,
      'ownership_transferred',
      null,
      next.m.id,
      {
        fromRole: next.role,
        toRole: 'owner',
        reason: 'account_deleted',
      },
    );
    const users = await this.users.findByIds(
      others.map((m) => m.userId!).filter(Boolean),
    );
    const recipients = others
      .filter((m) => m.id === next.m.id || m.role === 'admin')
      .map((m) => m.userId)
      .filter((id): id is string => !!id);
    if (recipients.length > 0 && !budget.isDeleted)
      await this.publisher.publish('budget.owner_changed', {
        budgetId: budget.id,
        budgetName: budget.name,
        newOwnerFirstName: users.get(next.m.userId!)?.firstName ?? '',
        recipientUserIds: recipients,
      });
  }

  private async currentBudgets(userId: string) {
    const mine = await this.memberships.listCurrentByUser(userId);
    const budgets = await this.budgets.findByIds(mine.map((m) => m.budgetId));
    return Promise.all(
      mine.map(async (membership) => ({
        membership,
        budget: budgets.find((b) => b.id === membership.budgetId)!,
        others: (
          await this.memberships.listByBudget(membership.budgetId)
        ).filter((m) => m.isCurrent && m.id !== membership.id),
      })),
    ).then((rows) => rows.filter((r) => r.budget));
  }
}
