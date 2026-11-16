import { Inject, Injectable } from '@nestjs/common';
import { can, type Permission } from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { Budget } from '../../domain/entities/budget';
import type { Membership } from '../../domain/entities/membership';
import {
  BUDGET_REPOSITORY,
  type BudgetRepository,
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../domain/ports/repositories';

export interface BudgetAccessGrant {
  budget: Budget;
  membership: Membership;
}

/**
 * Who may touch a budget (FR-039, FR-040): only a current member of a budget that isn't deleted.
 * Anyone else gets BUDGET_NOT_FOUND, the same answer as for a budget that doesn't exist; a member
 * whose role lacks the permission gets FORBIDDEN. Used by the HTTP guard and, under the budget lock,
 * by every mutation.
 */
@Injectable()
export class BudgetAccess {
  constructor(
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
  ) {}

  /** Pass `forUpdate` inside a transaction to lock the budget row (R11). */
  async resolve(
    budgetId: string,
    userId: string,
    options: { forUpdate?: boolean } = {},
  ): Promise<BudgetAccessGrant> {
    const budget = options.forUpdate
      ? await this.budgets.findByIdForUpdate(budgetId)
      : await this.budgets.findById(budgetId);
    if (!budget || budget.isDeleted) throw new DomainError('BUDGET_NOT_FOUND');
    const membership = await this.memberships.findCurrent(budgetId, userId);
    if (!membership) throw new DomainError('BUDGET_NOT_FOUND');
    return { budget, membership };
  }

  async require(
    budgetId: string,
    userId: string,
    permission: Permission,
    options: { forUpdate?: boolean } = {},
  ): Promise<BudgetAccessGrant> {
    const grant = await this.resolve(budgetId, userId, options);
    if (!can(grant.membership.role, permission))
      throw new DomainError('FORBIDDEN');
    return grant;
  }
}
