import { Inject, Injectable } from '@nestjs/common';
import {
  type CreateMonthRequest,
  type MonthDetail,
  TemplateLine,
} from '@two-cents/shared/contracts';
import {
  addDays,
  copyLinesForNewMonth,
  type CopySource,
} from '@two-cents/shared/domain';
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
import { BudgetLine } from '../../domain/entities/budget-line';
import { BudgetMonth } from '../../domain/entities/budget-month';
import { IncomeLine } from '../../domain/entities/income-line';
import {
  INCOME_LINE_REPOSITORY,
  type IncomeLineRepository,
  LINE_REPOSITORY,
  type LineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
  TEMPLATE_REPOSITORY,
  type TemplateRepository,
} from '../../domain/ports/repositories';
import { MonthDetailView } from '../services/month-detail-view';
import { MonthWriter } from '../services/month-writer';
import { toPlanIncomes } from '../services/plan-mapping';

type Source = Exclude<CreateMonthRequest['source'], undefined>;

/**
 * US1/US2/US7: creates a month (FR-004) from scratch, the previous month, any month or a template.
 * Allowed periods: any past one, the current one and the next one (research R1). A month that
 * exists but holds no line (e.g. made by the 002 income route) is filled instead (R14).
 */
@Injectable()
export class CreateMonth {
  constructor(
    private readonly access: BudgetAccess,
    private readonly writer: MonthWriter,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
    @Inject(INCOME_LINE_REPOSITORY)
    private readonly incomes: IncomeLineRepository,
    @Inject(TEMPLATE_REPOSITORY) private readonly templates: TemplateRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(
    auth: AuthContext,
    budgetId: string,
    periodStart: string,
    source: Source,
  ): Promise<MonthDetail> {
    return this.tx.run(async () => {
      const { budget, membership } = await this.access.require(
        budgetId,
        auth.userId,
        'months.create',
        {
          forUpdate: true,
        },
      );
      const now = this.clock.now();
      const period = budget.monthOf(periodStart);
      const next = budget.monthOf(addDays(budget.currentMonth(now).end, 1));
      if (period.start !== periodStart || periodStart > next.start)
        throw new DomainError('INVALID_MONTH');

      let month = await this.months.findByStart(budgetId, periodStart, {
        forUpdate: true,
      });
      if (month && (await this.lines.existsForMonth(month.id)))
        throw new DomainError('MONTH_EXISTS');

      const origin = await this.origin(budgetId, periodStart, source);
      if (!month) {
        month = BudgetMonth.create({
          id: this.ids.next(),
          budgetId,
          period,
          createdFrom: source.kind,
          sourceMonthId: origin.monthId,
          sourceTemplateId: origin.templateId,
          by: membership.id,
          now,
        });
      } else {
        month.markFilledFrom(source.kind, origin.monthId, origin.templateId);
      }
      await this.months.save(month);

      return this.writer.write(
        auth,
        budgetId,
        periodStart,
        'months.create',
        async (ctx) => {
          // Pre-filled incomes, to confirm (FR-006): only for members still counting, and only if they have none yet.
          if (origin.incomes.length) {
            const hasIncome = new Set(ctx.incomes.map((i) => i.membershipId));
            const members = new Set(ctx.members.map((m) => m.id));
            for (const src of origin.incomes) {
              if (
                !members.has(src.membershipId) ||
                hasIncome.has(src.membershipId)
              )
                continue;
              const income = IncomeLine.create({
                ...src.toPersistence(),
                id: ctx.newId(),
                monthId: ctx.month.id,
                toConfirm: true,
                version: 1,
                createdAt: ctx.now,
                createdBy: ctx.me.id,
                updatedAt: ctx.now,
                updatedBy: ctx.me.id,
              });
              await this.incomes.save(income);
              ctx.incomes.push(income);
            }
          }
          const copies = copyLinesForNewMonth(
            origin.lines,
            ctx.planMembers,
            toPlanIncomes(ctx.incomes),
            {
              includeOneOff: origin.includeOneOff,
            },
          );
          for (const copy of copies) {
            const src = copy.source;
            const line = BudgetLine.create({
              ...copy.amounts,
              id: ctx.newId(),
              monthId: ctx.month.id,
              budgetId,
              seriesId:
                src.group === 'one_off_shared' ? ctx.newId() : src.seriesId,
              group: src.group,
              kind: src.kind,
              label: src.label,
              categoryId: src.categoryId,
              isEnvelope: src.isEnvelope,
              ownerMembershipId: src.ownerMembershipId,
              isPrivate: src.isPrivate,
              currency: budget.currency,
              position: src.position,
              version: 1,
              handEdited: false,
              usual: null,
              needsReview: copy.needsReview,
              needsIncome: copy.needsIncome,
              subItems: src.subItems.map((s) => ({ ...s, id: ctx.newId() })),
              createdAt: ctx.now,
              createdBy: ctx.me.id,
              updatedAt: ctx.now,
              updatedBy: ctx.me.id,
            });
            await this.lines.save(line);
            ctx.lines.push(line);
          }
          await ctx.record({
            entity: 'month',
            entityId: ctx.month.id,
            action: 'created',
            isPrivate: false,
            ownerMembershipId: null,
            labelSnapshot: null,
            changes: [
              { field: 'source', old: null, new: source.kind },
              ...(origin.monthStart
                ? [{ field: 'sourceMonth', old: null, new: origin.monthStart }]
                : []),
            ],
          });
        },
      );
    });
  }

  private async origin(budgetId: string, periodStart: string, source: Source) {
    const none = {
      monthId: null as string | null,
      monthStart: null as string | null,
      templateId: null as string | null,
      lines: [] as Array<CopySource & SourceLine>,
      incomes: [] as IncomeLine[],
      includeOneOff: false,
    };
    if (source.kind === 'scratch') return none;
    if (source.kind === 'template') {
      const template = await this.templates.findById(
        budgetId,
        source.templateId,
      );
      if (!template) throw new DomainError('NOT_FOUND');
      const lines = TemplateLine.array()
        .parse(template.lines)
        .map(fromTemplateLine);
      return { ...none, templateId: template.id, lines, includeOneOff: true };
    }
    const month =
      source.kind === 'previous'
        ? await this.months.findLatestBefore(budgetId, periodStart)
        : await this.months.findByStart(budgetId, source.monthStart);
    if (!month || month.periodStart === periodStart)
      throw new DomainError('INVALID_MONTH');
    const [lines, incomes] = await Promise.all([
      this.lines.listForMonth(month.id),
      this.incomes.listForMonth(month.id),
    ]);
    return {
      ...none,
      monthId: month.id,
      monthStart: month.periodStart,
      lines: lines.map(fromLine),
      incomes,
      includeOneOff: source.kind === 'month' && source.includeOneOff === true,
    };
  }
}

/** The fields a copy keeps besides its amounts. */
interface SourceLine {
  seriesId: string;
  kind: 'expense' | 'savings';
  label: string;
  categoryId: string | null;
  isEnvelope: boolean;
  isPrivate: boolean;
  position: number;
  subItems: Array<{
    id: string;
    label: string;
    amountMinor: bigint | null;
    position: number;
  }>;
}

const fromLine = (l: BudgetLine): CopySource & SourceLine => ({
  ...l.amountFields(),
  group: l.group,
  ownerMembershipId: l.ownerMembershipId,
  usual: l.usual,
  seriesId: l.seriesId,
  kind: l.kind,
  label: l.label,
  categoryId: l.categoryId,
  isEnvelope: l.isEnvelope,
  isPrivate: l.isPrivate,
  position: l.position,
  subItems: [...l.subItems],
});

const fromTemplateLine = (t: TemplateLine): CopySource & SourceLine => ({
  group: t.group,
  ownerMembershipId: t.ownerMembershipId,
  totalMinor: BigInt(t.totalMinor),
  splitMode: t.splitMode,
  payerMembershipId: t.payerMembershipId,
  shares: Object.fromEntries(
    t.shares.map((s) => [s.membershipId, BigInt(s.amountMinor)]),
  ),
  formula: t.formula
    ? {
        kind: t.formula.kind,
        baseMinor: BigInt(t.formula.baseMinor),
        factor: t.formula.factor,
      }
    : null,
  usual: null,
  // Lines from a template start new series: a template is not a month.
  seriesId: crypto.randomUUID(),
  kind: t.kind,
  label: t.label,
  categoryId: t.categoryId,
  isEnvelope: t.isEnvelope,
  isPrivate: t.isPrivate,
  position: t.position,
  subItems: t.subItems.map((s, position) => ({
    id: '',
    label: s.label,
    amountMinor: s.amountMinor === null ? null : BigInt(s.amountMinor),
    position,
  })),
});

/** US1: one month for the caller, with a cheap revision check for polling (research R4). */
@Injectable()
export class GetMonth {
  constructor(
    private readonly access: BudgetAccess,
    private readonly view: MonthDetailView,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
  ) {}

  async revision(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
  ): Promise<string | null> {
    await this.access.require(budgetId, auth.userId, 'budget.read');
    const revision = await this.months.revisionOf(budgetId, monthStart);
    return revision === null ? null : revision.toString();
  }

  async execute(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
  ): Promise<MonthDetail> {
    const { budget, membership } = await this.access.require(
      budgetId,
      auth.userId,
      'budget.read',
    );
    const month = await this.months.findByStart(budgetId, monthStart);
    if (!month) throw new DomainError('MONTH_NOT_FOUND');
    return this.view.build(budget, membership, month);
  }
}
