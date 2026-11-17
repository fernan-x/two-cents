import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateLineRequest,
  LineAmountInput,
  MonthDetail,
  ReorderLinesRequest,
  UpdateLineRequest,
} from '@two-cents/shared/contracts';
import {
  computeShares,
  type Formula,
  type FormulaKind,
  type Group,
  monthlyFromFormula,
  needsScope,
  type SplitMode,
  validateSubItems,
} from '@two-cents/shared/domain';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  type AmountFields,
  BudgetLine,
  type SubItem,
} from '../../domain/entities/budget-line';
import {
  CATEGORY_REPOSITORY,
  type CategoryRepository,
  LINE_REPOSITORY,
  type LineRepository,
} from '../../domain/ports/repositories';
import { diff, lineSnapshot } from '../services/history';
import { lineView } from '../services/month-detail-view';
import { type MonthContext, MonthWriter } from '../services/month-writer';
import { toPlanIncomes } from '../services/plan-mapping';
import { PropagateRecurring } from '../services/propagate-recurring';

type CreateInput = Omit<
  CreateLineRequest,
  'kind' | 'isEnvelope' | 'isPrivate'
> & {
  kind: 'expense' | 'savings';
  isEnvelope: boolean;
  isPrivate: boolean;
};
type UpdateInput = UpdateLineRequest;

const invalid = (path: string, message: string) =>
  new DomainError('VALIDATION_FAILED', { issues: [{ path: [path], message }] });

const toFormula = (f: {
  kind: string;
  baseMinor: string;
  factor: number;
}): Formula => ({
  kind: f.kind as FormulaKind,
  baseMinor: BigInt(f.baseMinor),
  factor: f.factor,
});

/**
 * Amount fields of a line from what the person entered (FR-017, FR-020, FR-023), through the shared
 * split and formula functions so the app and the API agree (Principle II).
 */
export function resolveAmounts(
  ctx: MonthContext,
  group: Group,
  owner: string | null,
  split: { mode: SplitMode; payerMembershipId?: string } | null,
  amount: LineAmountInput,
): AmountFields {
  const totalFrom = (a: Extract<LineAmountInput, { entry: 'total' }>) => {
    if (a.formula) {
      const formula = toFormula(a.formula);
      return { total: monthlyFromFormula(formula), formula };
    }
    return { total: BigInt(a.totalMinor!), formula: null };
  };

  if (group === 'personal') {
    if (amount.entry !== 'total')
      throw invalid('amount', 'a personal line takes a total');
    const { total, formula } = totalFrom(amount);
    const result = computeShares({
      mode: 'one_payer',
      total,
      payerMembershipId: owner!,
      members: ctx.planMembers.filter((m) => m.membershipId === owner),
      incomes: [],
    });
    return {
      totalMinor: result.total,
      splitMode: null,
      payerMembershipId: null,
      shares: result.shares,
      formula,
    };
  }

  const mode = split?.mode ?? 'custom';
  if (mode === 'custom') {
    if (amount.entry !== 'shares')
      throw invalid('amount', 'custom split takes per-member amounts');
    const result = computeShares({
      mode,
      total:
        amount.totalMinor !== undefined ? BigInt(amount.totalMinor) : undefined,
      enteredShares: Object.fromEntries(
        amount.shares.map((s) => [s.membershipId, BigInt(s.amountMinor)]),
      ),
      members: ctx.planMembers,
      incomes: [],
    });
    return {
      totalMinor: result.total,
      splitMode: 'custom',
      payerMembershipId: null,
      shares: result.shares,
      formula: null,
    };
  }
  if (amount.entry !== 'total')
    throw invalid('amount', 'this split takes a total');
  const { total, formula } = totalFrom(amount);
  const result = computeShares({
    mode,
    total,
    payerMembershipId: split?.payerMembershipId,
    members: ctx.planMembers,
    incomes: toPlanIncomes(ctx.incomes),
  });
  return {
    totalMinor: result.total,
    splitMode: mode,
    payerMembershipId: mode === 'one_payer' ? split!.payerMembershipId! : null,
    shares: result.shares,
    formula,
  };
}

function nextPosition(
  ctx: MonthContext,
  group: Group,
  owner: string | null,
): number {
  const section = ctx.lines.filter(
    (l) => l.group === group && l.ownerMembershipId === owner,
  );
  return section.reduce((max, l) => Math.max(max, l.position + 1), 0);
}

function findLine(ctx: MonthContext, lineId: string): BudgetLine {
  const line = ctx.lines.find((l) => l.id === lineId);
  // A private line of someone else is "not found" for everyone but its owner (R10).
  if (!line || (line.isPrivate && line.ownerMembershipId !== ctx.me.id))
    throw new DomainError('NOT_FOUND');
  return line;
}

function assertCanEdit(ctx: MonthContext, line: BudgetLine): void {
  if (line.group === 'personal' && line.ownerMembershipId !== ctx.me.id)
    throw new DomainError('NOT_LINE_OWNER');
}

function assertVersion(line: BudgetLine, expected: number): void {
  if (line.version !== expected)
    throw new DomainError('STALE_STATE', { current: lineView(line, true) });
}

function subItemsFrom(
  ctx: MonthContext,
  items: Array<{ label: string; amountMinor?: string | null }> | undefined,
): SubItem[] {
  return (items ?? []).map((s, position) => ({
    id: ctx.newId(),
    label: s.label,
    amountMinor: s.amountMinor == null ? null : BigInt(s.amountMinor),
    position,
  }));
}

const changeOf = (
  line: BudgetLine,
  action: 'created' | 'updated' | 'deleted',
  changes: ReturnType<typeof diff>,
) => ({
  entity: 'line' as const,
  entityId: line.id,
  action,
  isPrivate: line.isPrivate,
  ownerMembershipId: line.ownerMembershipId,
  labelSnapshot: line.label,
  changes,
});

/** US1 (and US3, US4, US6 rules): budget lines of a month. */
@Injectable()
export class Lines {
  constructor(
    private readonly writer: MonthWriter,
    private readonly propagate: PropagateRecurring,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
    @Inject(CATEGORY_REPOSITORY)
    private readonly categories: CategoryRepository,
  ) {}

  create(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    input: CreateInput,
  ): Promise<MonthDetail> {
    return this.writer.write(
      auth,
      budgetId,
      monthStart,
      'entries.write',
      async (ctx) => {
        const personal = input.group === 'personal';
        const owner = personal ? (input.ownerMembershipId ?? ctx.me.id) : null;
        if (personal && owner !== ctx.me.id)
          throw new DomainError('NOT_LINE_OWNER');
        if (personal && !ctx.members.some((m) => m.id === owner))
          throw new DomainError('INVALID_MONTH');
        if (!personal && input.isPrivate)
          throw invalid('isPrivate', 'personal lines only');
        await this.assertCategory(budgetId, input.categoryId);
        const amounts = resolveAmounts(
          ctx,
          input.group,
          owner,
          personal ? null : (input.split ?? null),
          input.amount,
        );
        const subItems = subItemsFrom(ctx, input.subItems);
        validateSubItems(amounts.totalMinor, subItems);
        const line = BudgetLine.create({
          ...amounts,
          id: ctx.newId(),
          monthId: ctx.month.id,
          budgetId,
          seriesId: ctx.newId(),
          group: input.group,
          kind: input.kind,
          label: input.label,
          categoryId: input.categoryId ?? null,
          isEnvelope: input.isEnvelope,
          ownerMembershipId: owner,
          isPrivate: personal && input.isPrivate,
          currency: ctx.budget.currency,
          position: nextPosition(ctx, input.group, owner),
          version: 1,
          handEdited: false,
          usual: null,
          needsReview: false,
          needsIncome: false,
          subItems: input.isEnvelope ? subItems : [],
          createdAt: ctx.now,
          createdBy: ctx.me.id,
          updatedAt: ctx.now,
          updatedBy: ctx.me.id,
        });
        await this.lines.save(line);
        ctx.lines.push(line);
        await ctx.record(
          changeOf(line, 'created', diff(null, lineSnapshot(line))),
        );
      },
    );
  }

  update(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    lineId: string,
    input: UpdateInput,
  ): Promise<MonthDetail> {
    return this.writer.write(
      auth,
      budgetId,
      monthStart,
      'entries.write',
      async (ctx) => {
        const line = findLine(ctx, lineId);
        assertCanEdit(ctx, line);
        assertVersion(line, input.expectedVersion);
        const before = lineSnapshot(line);
        const usualBefore = line.usual;

        const group = input.group ?? line.group;
        const personal = group === 'personal';
        const owner = personal
          ? (input.ownerMembershipId ?? line.ownerMembershipId ?? ctx.me.id)
          : null;
        if (personal && owner !== ctx.me.id)
          throw new DomainError('NOT_LINE_OWNER');
        const isPrivate = personal
          ? (input.isPrivate ?? line.isPrivate)
          : false;
        if (!personal && input.isPrivate)
          throw invalid('isPrivate', 'personal lines only');
        if (input.categoryId !== undefined)
          await this.assertCategory(budgetId, input.categoryId);

        const groupMoved = group !== line.group;
        const amountTouched =
          input.amount !== undefined || input.split !== undefined || groupMoved;
        let amounts = line.amountFields();
        if (amountTouched) {
          const split = personal
            ? null
            : (input.split ??
              (line.splitMode
                ? {
                    mode: line.splitMode,
                    payerMembershipId: line.payerMembershipId ?? undefined,
                  }
                : { mode: 'equal' as const }));
          const amount: LineAmountInput =
            input.amount ??
            (split?.mode === 'custom' && !groupMoved
              ? {
                  entry: 'shares',
                  shares: Object.entries(line.shares).map(
                    ([membershipId, v]) => ({
                      membershipId,
                      amountMinor: v.toString(),
                    }),
                  ),
                }
              : line.formula
                ? {
                    entry: 'total',
                    formula: {
                      kind: line.formula.kind,
                      baseMinor: line.formula.baseMinor.toString(),
                      factor: line.formula.factor,
                    },
                  }
                : { entry: 'total', totalMinor: line.totalMinor.toString() });
          amounts = resolveAmounts(ctx, group, owner, split, amount);
        }
        const subItems =
          input.subItems !== undefined
            ? subItemsFrom(ctx, input.subItems)
            : [...line.subItems];
        const isEnvelope = input.isEnvelope ?? line.isEnvelope;
        validateSubItems(amounts.totalMinor, isEnvelope ? subItems : []);

        const amountChanged = diff(
          amountSnapshot(line.amountFields()),
          amountSnapshot(amounts),
        ).map((c) => (c.field.startsWith('share:') ? 'shares' : c.field));
        const scopeNeeded =
          line.group !== 'one_off_shared' &&
          !groupMoved &&
          needsScope(line.group, amountChanged);
        if (scopeNeeded && !input.scope)
          throw new DomainError('SCOPE_REQUIRED');

        let usual = line.usual;
        if (scopeNeeded && input.scope === 'this_month_only') {
          usual = line.usual ?? line.amountFields();
          if (diff(amountSnapshot(usual), amountSnapshot(amounts)).length === 0)
            usual = null;
        } else if (scopeNeeded) {
          usual = null;
        }

        line.update(
          {
            ...amounts,
            group,
            ownerMembershipId: owner,
            isPrivate,
            kind: input.kind ?? line.kind,
            label: input.label ?? line.label,
            categoryId:
              input.categoryId !== undefined
                ? input.categoryId
                : line.categoryId,
            isEnvelope,
            subItems: isEnvelope ? subItems : [],
            usual,
            handEdited: line.handEdited || amountChanged.length > 0,
            needsReview: amountChanged.length > 0 ? false : line.needsReview,
            needsIncome:
              amounts.splitMode === 'proportional'
                ? line.needsIncome && amountChanged.length === 0
                : false,
            position: groupMoved
              ? nextPosition(ctx, group, owner)
              : line.position,
          },
          ctx.me.id,
          ctx.now,
        );
        await this.lines.save(line);
        await ctx.record(
          changeOf(line, 'updated', diff(before, lineSnapshot(line))),
        );

        if (scopeNeeded && input.scope === 'from_this_month_on')
          await this.propagate.run(ctx, line, usualBefore);
      },
    );
  }

  remove(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    lineId: string,
    expectedVersion: number,
  ): Promise<MonthDetail> {
    return this.writer.write(
      auth,
      budgetId,
      monthStart,
      'entries.write',
      async (ctx) => {
        const line = findLine(ctx, lineId);
        assertCanEdit(ctx, line);
        assertVersion(line, expectedVersion);
        await this.lines.delete(line.id);
        ctx.lines.splice(ctx.lines.indexOf(line), 1);
        await ctx.record(
          changeOf(line, 'deleted', diff(lineSnapshot(line), null)),
        );
      },
    );
  }

  reorder(
    auth: AuthContext,
    budgetId: string,
    monthStart: string,
    input: ReorderLinesRequest,
  ): Promise<MonthDetail> {
    return this.writer.write(
      auth,
      budgetId,
      monthStart,
      'entries.write',
      async (ctx) => {
        const owner =
          input.group === 'personal'
            ? (input.ownerMembershipId ?? ctx.me.id)
            : null;
        if (input.group === 'personal' && owner !== ctx.me.id)
          throw new DomainError('NOT_LINE_OWNER');
        const section = ctx.lines.filter(
          (l) => l.group === input.group && l.ownerMembershipId === owner,
        );
        const ids = new Set(section.map((l) => l.id));
        if (
          ids.size !== input.lineIds.length ||
          !input.lineIds.every((id) => ids.has(id))
        )
          throw new DomainError('STALE_STATE', {
            current: section
              .sort((a, b) => a.position - b.position)
              .map((l) => l.id),
          });
        for (const [position, id] of input.lineIds.entries()) {
          const line = section.find((l) => l.id === id)!;
          if (line.position === position) continue;
          line.update({ position }, ctx.me.id, ctx.now);
          await this.lines.save(line);
        }
        await ctx.record({
          entity: 'order',
          entityId: null,
          action: 'reordered',
          isPrivate: false,
          ownerMembershipId: owner,
          labelSnapshot: input.group,
          changes: [],
        });
      },
    );
  }

  private async assertCategory(
    budgetId: string,
    categoryId: string | null | undefined,
  ) {
    if (!categoryId) return;
    if (!(await this.categories.findById(budgetId, categoryId)))
      throw invalid('categoryId', 'unknown category');
  }
}

/** Amount fields only, as a snapshot for comparisons. */
export function amountSnapshot(a: AmountFields): Record<string, string | null> {
  const s: Record<string, string | null> = {
    totalMinor: a.totalMinor.toString(),
    splitMode: a.splitMode,
    payerMembershipId: a.payerMembershipId,
    formula: a.formula
      ? `${a.formula.kind}:${a.formula.baseMinor.toString()}:${a.formula.factor}`
      : null,
  };
  for (const [id, v] of Object.entries(a.shares))
    s[`share:${id}`] = v.toString();
  return s;
}
