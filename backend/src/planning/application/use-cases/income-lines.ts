import { Inject, Injectable } from '@nestjs/common';
import type { MonthDetail, Money } from '@two-cents/shared/contracts';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
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
import { BudgetMonth } from '../../domain/entities/budget-month';
import { IncomeLine } from '../../domain/entities/income-line';
import {
  INCOME_LINE_REPOSITORY,
  type IncomeLineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../domain/ports/repositories';
import { diff, incomeSnapshot } from '../services/history';
import { incomeView } from '../services/month-detail-view';
import type { MonthContext } from '../services/month-writer';
import { MonthWriter } from '../services/month-writer';
import { RecomputeProportional } from '../services/recompute-proportional';

/** The caller must count in the month to have incomes there (002 FR-033). */
function assertContributing(ctx: MonthContext): void {
  if (!ctx.members.some((m) => m.id === ctx.me.id))
    throw new DomainError('INVALID_MONTH');
}

function ownIncome(ctx: MonthContext, incomeId: string): IncomeLine {
  const income = ctx.incomes.find((i) => i.id === incomeId);
  if (!income) throw new DomainError('NOT_FOUND');
  if (income.membershipId !== ctx.me.id)
    throw new DomainError('NOT_INCOME_OWNER');
  return income;
}

function assertVersion(income: IncomeLine, expected: number): void {
  if (income.version !== expected)
    throw new DomainError('STALE_STATE', { current: incomeView(income, true) });
}

/** US1: income lines of the caller (FR-009, FR-010), each change recomputing proportional splits (FR-022). */
@Injectable()
export class IncomeLines {
  constructor(
    private readonly writer: MonthWriter,
    private readonly recompute: RecomputeProportional,
    @Inject(INCOME_LINE_REPOSITORY)
    private readonly incomes: IncomeLineRepository,
  ) {}

  add(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    input: {
      label?: string;
      amountMinor: string;
      countsTowardHousehold: boolean;
    },
  ): Promise<MonthDetail> {
    return this.writer.write(
      auth,
      budgetId,
      monthStart,
      'income.write.own',
      async (ctx) => {
        assertContributing(ctx);
        const mine = ctx.incomes.filter((i) => i.membershipId === ctx.me.id);
        const income = IncomeLine.create({
          id: ctx.newId(),
          monthId: ctx.month.id,
          membershipId: ctx.me.id,
          label: input.label ?? null,
          amountMinor: BigInt(input.amountMinor),
          currency: ctx.budget.currency,
          countsTowardHousehold: input.countsTowardHousehold,
          toConfirm: false,
          isPrimary: mine.length === 0,
          position: mine.length,
          version: 1,
          createdAt: ctx.now,
          createdBy: ctx.me.id,
          updatedAt: ctx.now,
          updatedBy: ctx.me.id,
        });
        await this.incomes.save(income);
        ctx.incomes.push(income);
        await ctx.record(
          this.change(income, 'created', null, incomeSnapshot(income)),
        );
        await this.recompute.run(ctx);
      },
    );
  }

  update(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    incomeId: string,
    input: {
      expectedVersion: number;
      label?: string | null;
      amountMinor?: string;
      countsTowardHousehold?: boolean;
    },
  ): Promise<MonthDetail> {
    return this.writer.write(
      auth,
      budgetId,
      monthStart,
      'income.write.own',
      async (ctx) => {
        const income = ownIncome(ctx, incomeId);
        assertVersion(income, input.expectedVersion);
        const before = incomeSnapshot(income);
        income.update(
          {
            ...(input.label !== undefined ? { label: input.label } : {}),
            ...(input.amountMinor !== undefined
              ? { amountMinor: BigInt(input.amountMinor) }
              : {}),
            ...(input.countsTowardHousehold !== undefined
              ? { countsTowardHousehold: input.countsTowardHousehold }
              : {}),
          },
          ctx.me.id,
          ctx.now,
        );
        await this.incomes.save(income);
        await ctx.record(
          this.change(income, 'updated', before, incomeSnapshot(income)),
        );
        await this.recompute.run(ctx);
      },
    );
  }

  remove(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    incomeId: string,
    expectedVersion: number,
  ): Promise<MonthDetail> {
    return this.writer.write(
      auth,
      budgetId,
      monthStart,
      'income.write.own',
      async (ctx) => {
        const income = ownIncome(ctx, incomeId);
        assertVersion(income, expectedVersion);
        await this.incomes.delete(income.id);
        ctx.incomes.splice(ctx.incomes.indexOf(income), 1);
        await ctx.record(
          this.change(income, 'deleted', incomeSnapshot(income), null),
        );
        await this.recompute.run(ctx);
      },
    );
  }

  /** US2: the caller confirms their pre-filled incomes (FR-006). */
  confirm(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
  ): Promise<MonthDetail> {
    return this.writer.write(
      auth,
      budgetId,
      monthStart,
      'income.write.own',
      async (ctx) => {
        for (const income of ctx.incomes) {
          if (income.membershipId !== ctx.me.id) continue;
          if (!income.confirm(ctx.me.id, ctx.now)) continue;
          await this.incomes.save(income);
          await ctx.record({ ...this.change(income, 'confirmed', null, null) });
        }
      },
    );
  }

  private change(
    income: IncomeLine,
    action: 'created' | 'updated' | 'deleted' | 'confirmed',
    before: Record<string, string | null> | null,
    after: Record<string, string | null> | null,
  ) {
    return {
      entity: 'income' as const,
      entityId: income.id,
      action,
      isPrivate: false,
      ownerMembershipId: income.membershipId,
      labelSnapshot: income.label,
      changes: diff(before, after),
    };
  }
}

/**
 * The spec 002 route `PUT /budgets/:b/members/me/income/:monthStart`, kept for older app versions
 * (research R13): sets the caller's primary income line, creating an empty Draft month if needed.
 * Returns the caller's counted income for the month.
 */
@Injectable()
export class UpsertPrimaryIncome {
  constructor(
    private readonly access: BudgetAccess,
    private readonly writer: MonthWriter,
    private readonly recompute: RecomputeProportional,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(INCOME_LINE_REPOSITORY)
    private readonly incomes: IncomeLineRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  execute(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    amountMinor: string,
  ): Promise<Money> {
    return this.tx.run(async () => {
      const { budget, membership } = await this.access.require(
        budgetId,
        auth.userId,
        'income.write.own',
        { forUpdate: true },
      );
      const now = this.clock.now();
      const period = budget.monthOf(monthStart);
      if (
        period.start !== monthStart ||
        monthStart > budget.currentMonth(now).start
      )
        throw new DomainError('INVALID_MONTH');
      if (!(await this.months.findByStart(budgetId, monthStart)))
        await this.months.save(
          BudgetMonth.create({
            id: this.ids.next(),
            budgetId,
            period,
            createdFrom: 'income',
            by: membership.id,
            now,
          }),
        );
      const amount = BigInt(amountMinor);
      const detail = await this.writer.write(
        auth,
        budgetId,
        monthStart,
        'income.write.own',
        async (ctx) => {
          assertContributing(ctx);
          const primary =
            ctx.incomes.find(
              (i) => i.membershipId === membership.id && i.isPrimary,
            ) ?? null;
          if (primary) {
            const before = incomeSnapshot(primary);
            primary.update({ amountMinor: amount }, membership.id, ctx.now);
            await this.incomes.save(primary);
            await ctx.record({
              entity: 'income',
              entityId: primary.id,
              action: 'updated',
              isPrivate: false,
              ownerMembershipId: membership.id,
              labelSnapshot: primary.label,
              changes: diff(before, incomeSnapshot(primary)),
            });
          } else {
            const income = IncomeLine.create({
              id: ctx.newId(),
              monthId: ctx.month.id,
              membershipId: membership.id,
              label: null,
              amountMinor: amount,
              currency: budget.currency,
              countsTowardHousehold: true,
              toConfirm: false,
              isPrimary: true,
              position: 0,
              version: 1,
              createdAt: ctx.now,
              createdBy: membership.id,
              updatedAt: ctx.now,
              updatedBy: membership.id,
            });
            await this.incomes.save(income);
            ctx.incomes.push(income);
            await ctx.record({
              entity: 'income',
              entityId: income.id,
              action: 'created',
              isPrivate: false,
              ownerMembershipId: membership.id,
              labelSnapshot: null,
              changes: diff(null, incomeSnapshot(income)),
            });
          }
          await this.recompute.run(ctx);
        },
      );
      const counted = detail.summary.members.find(
        (m) => m.membershipId === membership.id,
      );
      return {
        amountMinor: counted?.countedIncomeMinor ?? '0',
        currency: budget.currency,
      };
    });
  }
}
