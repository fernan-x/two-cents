import { Inject, Injectable } from '@nestjs/common';
import type {
  BudgetDetail,
  BudgetSummary,
  MemberView,
  PersonRef,
} from '@two-cents/shared/contracts';
import { CLOCK, type Clock } from '../../../shared-kernel/application/ports';
import type { Budget } from '../../domain/entities/budget';
import type { MemberIncome } from '../../domain/entities/member-income';
import type { Membership } from '../../domain/entities/membership';
import {
  INCOME_REPOSITORY,
  type IncomeRepository,
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../domain/ports/repositories';
import { USER_DIRECTORY, type UserDirectory, type UserInfo } from '../ports';

/** Builds the API views of budgets and people (contracts/rest-api.md). */
@Injectable()
export class BudgetViews {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(INCOME_REPOSITORY) private readonly incomes: IncomeRepository,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  summary(budget: Budget, me: Membership, memberCount: number): BudgetSummary {
    return {
      id: budget.id,
      name: budget.name,
      currency: budget.currency,
      myRole: me.role,
      memberCount,
      lastOpenedAt: me.lastOpenedAt?.toISOString() ?? null,
    };
  }

  async detail(budget: Budget, me: Membership): Promise<BudgetDetail> {
    const now = this.clock.now();
    const all = await this.memberships.listByBudget(budget.id);
    const current = all.filter((m) => m.isCurrent);
    const { members } = await this.people(budget, me, current, []);
    const month = budget.currentMonth(now);
    const pending = budget.pendingStartDay(now);
    const myIncome = members.find((m) => m.isMe)?.currentMonthIncome ?? null;
    return {
      ...this.summary(budget, me, current.length),
      monthStartDay: budget.monthStartDay(now),
      timeZone: budget.timeZone,
      currentMonth: month,
      pendingMonthStartDay: pending
        ? { startDay: pending.startDay, effectiveFrom: pending.effectiveFrom }
        : null,
      members,
      myIncomeMissing: me.role !== 'viewer' && myIncome === null,
      currencyLocked: await this.incomes.existsForBudget(budget.id),
    };
  }

  /** Current members (with this month's income) and former members, for the members screen. */
  async people(
    budget: Budget,
    me: Membership,
    current?: Membership[],
    former?: Membership[],
  ): Promise<{ members: MemberView[]; formerMembers: PersonRef[] }> {
    if (!current || !former) {
      const all = await this.memberships.listByBudget(budget.id);
      current ??= all.filter((m) => m.isCurrent);
      former ??= all.filter((m) => !m.isCurrent);
    }
    const month = budget.currentMonth(this.clock.now());
    const [users, incomes] = await Promise.all([
      this.users.findByIds(
        current.map((m) => m.userId).filter((id): id is string => !!id),
      ),
      this.incomes.listForMonth(
        current.map((m) => m.id),
        month.start,
      ),
    ]);
    const members = current
      .filter((m) => m.userId && users.has(m.userId))
      .map((m) =>
        this.memberView(m, users.get(m.userId!)!, incomes.get(m.id), me),
      )
      .sort(byRoleThenJoin);
    return { members, formerMembers: former.map(formerRef) };
  }

  memberView(
    m: Membership,
    user: UserInfo,
    income: MemberIncome | undefined,
    me: Membership,
  ): MemberView {
    return {
      membershipId: m.id,
      userId: user.id,
      displayName: user.firstName,
      avatarKey: user.avatarKey,
      colorKey: user.colorKey,
      role: m.role,
      joinedAt: m.joinedAt.toISOString(),
      isMe: m.id === me.id,
      currentMonthIncome:
        income && m.role !== 'viewer'
          ? {
              amountMinor: income.amountMinor.toString(),
              currency: income.currency,
            }
          : null,
    };
  }
}

const ROLE_ORDER = { owner: 0, admin: 1, member: 2, viewer: 3 } as const;

function byRoleThenJoin(a: MemberView, b: MemberView): number {
  return (
    ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
    a.joinedAt.localeCompare(b.joinedAt)
  );
}

/** A former member keeps their name; a deleted account is anonymous (R14-C3). */
export function formerRef(m: Membership): PersonRef {
  return {
    membershipId: m.id,
    displayName: m.displayNameSnapshot,
    formerMember: true,
  };
}
