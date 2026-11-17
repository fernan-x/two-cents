import { Inject, Injectable } from '@nestjs/common';
import type {
  ImportCommitResponse,
  ImportPreviewResult,
  ImportRequest,
} from '@two-cents/shared/contracts';
import {
  addDays,
  computeMonthSummary,
  PlanningError,
  validateSubItems,
} from '@two-cents/shared/domain';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import type { Budget } from '../../../budgets/domain/entities/budget';
import type { Membership } from '../../../budgets/domain/entities/membership';
import {
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../budgets/domain/ports/repositories';
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
  CATEGORY_REPOSITORY,
  type CategoryRepository,
  INCOME_LINE_REPOSITORY,
  type IncomeLineRepository,
  LINE_REPOSITORY,
  type LineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../domain/ports/repositories';
import { MonthWriter, type MonthContext } from '../services/month-writer';
import {
  contributingMembers,
  summaryView,
  toPlanIncomes,
  toPlanLine,
  toPlanMembers,
} from '../services/plan-mapping';
import { resolveAmounts } from './lines';

type ImportMonth = ImportRequest['months'][number];

interface Prepared {
  input: ImportMonth;
  period: { start: string; end: string };
  status: 'closed' | 'draft';
  conflict: 'exists' | null;
  members: Membership[];
  incomes: IncomeLine[];
  lines: BudgetLine[];
  issues: Array<{ lineIndex: number; code: string }>;
}

const codeOf = (e: unknown): string => {
  if (e instanceof PlanningError || e instanceof DomainError) return e.code;
  throw e;
};

/**
 * US8: months parsed from a spreadsheet on the device (research R16). `dryRun` validates and
 * recomputes without writing (the preview, FR-040–FR-042); a commit creates every month in one
 * transaction or none (FR-043). Past periods become Closed, the current and next Draft.
 */
@Injectable()
export class ImportMonths {
  constructor(
    private readonly access: BudgetAccess,
    private readonly writer: MonthWriter,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
    @Inject(INCOME_LINE_REPOSITORY)
    private readonly incomes: IncomeLineRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  execute(
    auth: AuthContext,
    budgetId: string,
    request: ImportRequest,
  ): Promise<ImportPreviewResult | ImportCommitResponse> {
    return this.tx.run(async () => {
      const { budget, membership } = await this.access.require(
        budgetId,
        auth.userId,
        'entries.write',
        {
          forUpdate: true,
        },
      );
      const all = await this.memberships.listByBudget(budgetId);
      const categoryIds = new Set(
        (await this.categories.list(budgetId)).map((c) => c.id),
      );
      const prepared: Prepared[] = [];
      for (const input of request.months)
        prepared.push(
          await this.prepare(budget, membership, all, categoryIds, input),
        );

      const preview: ImportPreviewResult = {
        months: prepared.map((p) => ({
          periodStart: p.input.periodStart,
          conflict: p.conflict,
          status: p.status,
          summary: summaryView(
            computeMonthSummary({
              members: toPlanMembers(p.members),
              incomes: toPlanIncomes(p.incomes),
              lines: p.lines.map(toPlanLine),
              privateAggregates: [],
            }),
          ),
          issues: p.issues,
        })),
      };
      if (request.dryRun) return preview;
      if (prepared.some((p) => p.conflict || p.issues.length > 0))
        throw new DomainError('IMPORT_INVALID', { preview });

      for (const [i, p] of prepared.entries()) {
        const month = BudgetMonth.create({
          id: this.ids.next(),
          budgetId,
          period: p.period,
          createdFrom: 'import',
          by: membership.id,
          now: this.clock.now(),
        });
        if (p.status === 'closed')
          month.closeOnImport(
            membership.id,
            this.clock.now(),
            preview.months[i].summary,
          );
        await this.months.save(month);
        for (const income of p.incomes)
          await this.incomes.save(rehome(income, month.id));
        for (const line of p.lines)
          await this.lines.save(rehomeLine(line, month.id));
        const ctx = await this.writer.context(
          budget,
          membership,
          month,
          'import',
        );
        await ctx.record({
          entity: 'month',
          entityId: month.id,
          action: 'created',
          isPrivate: false,
          ownerMembershipId: null,
          labelSnapshot: null,
          changes: [
            { field: 'source', old: null, new: 'import' },
            { field: 'lines', old: null, new: String(p.lines.length) },
          ],
        });
        await this.months.bumpRevision(month.id);
      }
      return { created: prepared.map((p) => p.input.periodStart) };
    });
  }

  private async prepare(
    budget: Budget,
    me: Membership,
    all: Membership[],
    categoryIds: Set<string>,
    input: ImportMonth,
  ): Promise<Prepared> {
    const now = this.clock.now();
    const period = budget.monthOf(input.periodStart);
    const current = budget.currentMonth(now);
    const next = budget.monthOf(addDays(current.end, 1));
    if (period.start !== input.periodStart || input.periodStart > next.start)
      throw new DomainError('INVALID_MONTH');
    const members = contributingMembers(budget, all, period);
    const memberIds = new Set(members.map((m) => m.id));
    const conflict = (await this.months.findByStart(
      budget.id,
      input.periodStart,
    ))
      ? ('exists' as const)
      : null;
    const issues: Prepared['issues'] = [];

    const incomes: IncomeLine[] = [];
    for (const [position, inc] of input.incomes.entries()) {
      if (!memberIds.has(inc.membershipId)) continue;
      incomes.push(
        IncomeLine.create({
          id: this.ids.next(),
          monthId: 'pending',
          membershipId: inc.membershipId,
          label: inc.label ?? null,
          amountMinor: BigInt(inc.amountMinor),
          currency: budget.currency,
          countsTowardHousehold: inc.countsTowardHousehold,
          toConfirm: false,
          isPrimary: !incomes.some((i) => i.membershipId === inc.membershipId),
          position,
          version: 1,
          createdAt: now,
          createdBy: me.id,
          updatedAt: now,
          updatedBy: me.id,
        }),
      );
    }

    const ctx = {
      planMembers: toPlanMembers(members),
      incomes,
    } as unknown as MonthContext;
    const lines: BudgetLine[] = [];
    for (const [lineIndex, l] of input.lines.entries()) {
      try {
        const personal = l.group === 'personal';
        const owner = personal ? (l.ownerMembershipId ?? null) : null;
        if (personal && (!owner || !memberIds.has(owner)))
          throw new DomainError('UNKNOWN_MEMBER');
        if (l.categoryId && !categoryIds.has(l.categoryId))
          throw new DomainError('VALIDATION_FAILED');
        const amounts = resolveAmounts(
          ctx,
          l.group,
          owner,
          personal ? null : (l.split ?? null),
          l.amount,
        );
        const subItems = (l.subItems ?? []).map((s, position) => ({
          id: this.ids.next(),
          label: s.label,
          amountMinor: s.amountMinor == null ? null : BigInt(s.amountMinor),
          position,
        }));
        validateSubItems(amounts.totalMinor, subItems);
        lines.push(
          BudgetLine.create({
            ...amounts,
            id: this.ids.next(),
            monthId: 'pending',
            budgetId: budget.id,
            seriesId: this.ids.next(),
            group: l.group,
            kind: l.kind ?? 'expense',
            label: l.label,
            categoryId: l.categoryId ?? null,
            isEnvelope: l.isEnvelope ?? false,
            ownerMembershipId: owner,
            isPrivate: false,
            currency: budget.currency,
            position: lines.filter(
              (x) => x.group === l.group && x.ownerMembershipId === owner,
            ).length,
            version: 1,
            handEdited: false,
            usual: null,
            needsReview: false,
            needsIncome: false,
            subItems: l.isEnvelope ? subItems : [],
            createdAt: now,
            createdBy: me.id,
            updatedAt: now,
            updatedBy: me.id,
          }),
        );
      } catch (e) {
        issues.push({ lineIndex, code: codeOf(e) });
      }
    }
    return {
      input,
      period,
      status: input.periodStart < current.start ? 'closed' : 'draft',
      conflict,
      members,
      incomes,
      lines,
      issues,
    };
  }
}

const rehome = (i: IncomeLine, monthId: string) =>
  IncomeLine.create({ ...i.toPersistence(), monthId });
const rehomeLine = (l: BudgetLine, monthId: string) =>
  BudgetLine.create({ ...l.toPersistence(), monthId });
