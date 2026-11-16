import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@two-cents/shared/domain';
import type { Request } from 'express';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { AuthContext } from '../../../shared-kernel/presentation/auth.guard';
import {
  BudgetAccess,
  type BudgetAccessGrant,
} from '../../application/services/budget-access';

const PERMISSION = 'budgets:permission';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The permission a `/budgets/:budgetId/...` route needs (data-model permission matrix). */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION, permission);

type BudgetRequest = Request & {
  auth?: AuthContext;
  budgetGrant?: BudgetAccessGrant;
};

/**
 * FR-039/FR-040: runs after AuthGuard on every budget-scoped route. A caller who isn't a current
 * member of a live budget gets 404 BUDGET_NOT_FOUND, exactly like an unknown id; a member without
 * the route's permission gets 403 FORBIDDEN. Fails closed on a route that declares no permission.
 */
@Injectable()
export class BudgetAccessGuard implements CanActivate {
  constructor(
    private readonly access: BudgetAccess,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION,
      [context.getHandler(), context.getClass()],
    );
    if (!permission)
      throw new Error(
        `${context.getClass().name}.${context.getHandler().name} has no @RequirePermission`,
      );
    const request = context.switchToHttp().getRequest<BudgetRequest>();
    if (!request.auth) throw new DomainError('UNAUTHENTICATED');
    const budgetId = request.params.budgetId;
    if (typeof budgetId !== 'string' || !UUID.test(budgetId))
      throw new DomainError('BUDGET_NOT_FOUND');
    request.budgetGrant = await this.access.require(
      budgetId,
      request.auth.userId,
      permission,
    );
    return true;
  }
}

/** The validated `:budgetId` (only on routes behind BudgetAccessGuard). */
export const BudgetId = createParamDecorator(
  (_: unknown, context: ExecutionContext): string => {
    const grant = context
      .switchToHttp()
      .getRequest<BudgetRequest>().budgetGrant;
    if (!grant) throw new DomainError('BUDGET_NOT_FOUND');
    return grant.budget.id;
  },
);
