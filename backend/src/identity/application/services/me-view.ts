import { Inject, Injectable } from '@nestjs/common';
import type { Me } from '@two-cents/shared/contracts';
import type { User } from '../../domain/entities/user';
import {
  BUDGET_MEMBERSHIP_PORT,
  type BudgetMembershipPort,
} from '../ports/budgets';
import {
  SIGN_IN_METHODS_READER,
  type SignInMethodsReader,
} from '../ports/sign-in-methods';

/** Builds the `Me` view returned by sign-in, refresh-bootstrap and profile routes. */
@Injectable()
export class MeView {
  constructor(
    @Inject(BUDGET_MEMBERSHIP_PORT)
    private readonly budgets: BudgetMembershipPort,
    @Inject(SIGN_IN_METHODS_READER)
    private readonly methods: SignInMethodsReader,
  ) {}

  async build(user: User): Promise<Me> {
    const p = user.toSnapshot();
    const providers = await this.methods.providersFor(user.id);
    return {
      id: p.id,
      email: p.email,
      emailConfirmed: p.emailConfirmedAt !== null,
      firstName: p.firstName,
      avatarKey: p.avatarKey as Me['avatarKey'],
      colorKey: p.colorKey as Me['colorKey'],
      locale: p.locale,
      currency: p.currency,
      signInMethods: [
        ...(p.passwordHash ? (['password'] as const) : []),
        ...providers,
      ],
      status: p.status,
      deletionScheduledAt: p.deletionScheduledAt?.toISOString() ?? null,
      hasBudget: await this.budgets.hasAnyBudget(p.id),
    };
  }
}
