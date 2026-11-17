import { Inject, Injectable } from '@nestjs/common';
import type {
  ChangeView,
  HistoryResponse,
  MonthAction,
  MonthDetail,
} from '@two-cents/shared/contracts';
import {
  computeMonthSummary,
  requiredPermission,
} from '@two-cents/shared/domain';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import { BudgetViews } from '../../../budgets/application/services/budget-views';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../budgets/domain/ports/repositories';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  CHANGE_LOG,
  type ChangeLog,
  type ChangeRecord,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../domain/ports/repositories';
import { MonthWriter } from '../services/month-writer';
import {
  summaryView,
  toPlanIncomes,
  toPlanLine,
} from '../services/plan-mapping';

const ACTION_RECORD = {
  activate: 'activated',
  close: 'closed',
  reopen: 'reopened',
} as const;

/**
 * US5: Draft → Active → Closed → (reopen) Active (FR-002, FR-003, FR-036, FR-038). Activation is
 * refused while lines need review (research R8); closing freezes the full summary.
 */
@Injectable()
export class ChangeMonthStatus {
  constructor(private readonly writer: MonthWriter) {}

  execute(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    action: MonthAction,
  ): Promise<MonthDetail> {
    return this.writer.write(
      auth,
      budgetId,
      monthStart,
      requiredPermission(action),
      async (ctx) => {
        if (action === 'activate') {
          const review = ctx.lines
            .filter((l) => l.needsReview)
            .map((l) => l.id);
          if (review.length > 0)
            throw new DomainError('LINES_NEED_REVIEW', { lineIds: review });
        }
        const before = ctx.month.status;
        const frozen =
          action === 'close'
            ? summaryView(
                computeMonthSummary({
                  members: ctx.planMembers,
                  incomes: toPlanIncomes(ctx.incomes),
                  lines: ctx.lines.map(toPlanLine),
                  privateAggregates: [],
                }),
              )
            : undefined;
        ctx.month.changeStatus(action, ctx.me.id, ctx.now, frozen);
        await ctx.record({
          entity: 'month',
          entityId: ctx.month.id,
          action: ACTION_RECORD[action],
          isPrivate: false,
          ownerMembershipId: null,
          labelSnapshot: null,
          changes: [{ field: 'status', old: before, new: ctx.month.status }],
        });
      },
      { allowClosed: action === 'reopen' },
    );
  }
}

const PAGE = 50;

/** US5: a month's change history (FR-035), private lines redacted for everyone but their owner (R10). */
@Injectable()
export class GetMonthHistory {
  constructor(
    private readonly access: BudgetAccess,
    private readonly people: BudgetViews,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(CHANGE_LOG) private readonly changes: ChangeLog,
  ) {}

  async execute(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    options: { cursor: string | null; all: boolean },
  ): Promise<HistoryResponse> {
    const { membership: me } = await this.access.require(
      budgetId,
      auth.userId,
      'budget.read',
    );
    const month = await this.months.findByStart(budgetId, monthStart);
    if (!month) throw new DomainError('MONTH_NOT_FOUND');
    const records = await this.changes.list(month.id, {
      before: options.cursor,
      limit: PAGE + 1,
      includeDraft: options.all,
    });
    const page = records.slice(0, PAGE);
    const refs = await this.people.personRefs(
      await this.memberships.listByBudget(budgetId),
    );
    return {
      changes: page.map((r) => toView(r, me.id, refs)),
      nextCursor: records.length > PAGE ? page[page.length - 1].id : null,
    };
  }
}

function toView(
  r: ChangeRecord,
  viewer: string,
  refs: Map<
    string,
    { membershipId: string; displayName: string | null; formerMember: boolean }
  >,
): ChangeView {
  const hidden = r.isPrivate && r.ownerMembershipId !== viewer;
  return {
    id: r.id,
    at: r.createdAt.toISOString(),
    actor: r.actorMembershipId ? (refs.get(r.actorMembershipId) ?? null) : null,
    cause: r.cause,
    entity: r.entity,
    action: r.action,
    private: hidden,
    label: hidden ? null : r.labelSnapshot,
    changes: hidden ? [] : r.changes,
  };
}
