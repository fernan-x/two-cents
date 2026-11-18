import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type {
  RecurringRuleCreate,
  RecurringRulePatch,
  RecurringRuleView,
} from '@two-cents/shared/contracts';
import {
  dueOccurrences,
  normalizeLabel,
  occurrenceDate,
  validatePayment,
} from '@two-cents/shared/domain';
import { BudgetAccess } from '../../../budgets/application/services/budget-access';
import type { Budget } from '../../../budgets/domain/entities/budget';
import {
  BUDGET_REPOSITORY,
  type BudgetRepository,
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
  PUSH_DEVICE_REPOSITORY,
  type PushDeviceRepository,
} from '../../../budgets/domain/ports/repositories';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import {
  type MonthContext,
  MonthWriter,
} from '../../../planning/application/services/month-writer';
import { diff } from '../../../planning/application/services/history';
import {
  CHANGE_LOG,
  type ChangeLog,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../../planning/domain/ports/repositories';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
  PUSH_SENDER,
  type PushSender,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  normalizeTxn,
  type TxnRecord,
  txnSnapshot,
} from '../../domain/entities/transaction';
import {
  RECURRING_RULE_REPOSITORY,
  type RecurringRuleRecord,
  type RecurringRuleRepository,
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/ports/repositories';
import { TrackingHooks } from '../services/tracking-hooks';
import { TxnWriter } from '../services/txn-writer';

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

/** The next date a rule will create a transaction on, from today (shown in the rule list). */
function nextOccurrence(
  rule: RecurringRuleRecord,
  budget: Budget,
  now: Date,
): string | null {
  if (!rule.active) return null;
  const today = budget.today(now);
  let period = budget.currentMonth(now);
  for (let i = 0; i < 3; i++) {
    const date = occurrenceDate(rule.dayOfMonth, period);
    if (date && date >= today && date >= rule.startsOn) return date;
    period = budget.monthOf(addDays(period.end, 1));
  }
  return null;
}

const ruleSnapshot = (
  r: RecurringRuleRecord,
): Record<string, string | null> => ({
  label: r.label,
  amountMinor: r.amountMinor.toString(),
  dayOfMonth: String(r.dayOfMonth),
  payer: r.payerMembershipId ?? 'joint',
  paymentMethod: r.paymentMethod,
  seriesId: r.seriesId,
  active: String(r.active),
});

/** US8 (FR-035, FR-038): recurring transaction rules. Edits only affect future occurrences. */
@Injectable()
export class RecurringRules {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(RECURRING_RULE_REPOSITORY)
    private readonly rules: RecurringRuleRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(CHANGE_LOG) private readonly changes: ChangeLog,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  /** FR-020: rule changes go to the current month's history (when that month exists). */
  private async record(
    budget: Budget,
    actor: string,
    rule: RecurringRuleRecord,
    action: 'created' | 'updated' | 'deleted',
    before: RecurringRuleRecord | null,
    after: RecurringRuleRecord | null,
  ): Promise<void> {
    const now = this.clock.now();
    const month = await this.months.findByStart(
      budget.id,
      budget.currentMonth(now).start,
    );
    if (!month) return;
    await this.changes.record({
      id: this.ids.next(),
      monthId: month.id,
      actorMembershipId: actor,
      cause: 'user',
      entity: 'recurring_rule',
      entityId: rule.id,
      action,
      isPrivate: false,
      ownerMembershipId: null,
      labelSnapshot: rule.label,
      changes: diff(
        before ? ruleSnapshot(before) : null,
        after ? ruleSnapshot(after) : null,
      ),
      monthStatus: month.status,
      createdAt: now,
    });
  }

  private async view(
    rule: RecurringRuleRecord,
    budget: Budget,
  ): Promise<RecurringRuleView> {
    const series = rule.seriesId
      ? await this.rules.seriesInfo(rule.budgetId, rule.seriesId)
      : null;
    return {
      id: rule.id,
      label: rule.label,
      amountMinor: rule.amountMinor.toString(),
      dayOfMonth: rule.dayOfMonth,
      payer: rule.payerMembershipId
        ? { kind: 'member', membershipId: rule.payerMembershipId }
        : { kind: 'joint' },
      paymentMethod: rule.paymentMethod,
      seriesId: rule.seriesId,
      lineLabel: series?.label ?? null,
      isShared: rule.isShared,
      active: rule.active,
      startsOn: rule.startsOn,
      nextOccurrence: nextOccurrence(rule, budget, this.clock.now()),
      version: rule.version,
    };
  }

  /** A rule targets a recurring series (Personal or Recurring shared); a personal one only its owner's. */
  private async assertSeries(
    budgetId: string,
    seriesId: string | null,
    me: string,
  ): Promise<void> {
    if (!seriesId) return;
    const info = await this.rules.seriesInfo(budgetId, seriesId);
    if (!info || info.group === 'one_off_shared')
      throw new DomainError('VALIDATION_FAILED');
    if (info.group === 'personal' && info.ownerMembershipId !== me)
      throw new DomainError('NOT_LINE_OWNER');
  }

  async list(
    auth: AuthContext,
    budgetId: string,
  ): Promise<RecurringRuleView[]> {
    const { budget } = await this.access.require(
      budgetId,
      auth.userId,
      'transactions.read',
    );
    const rules = await this.rules.list(budgetId);
    return Promise.all(rules.map((r) => this.view(r, budget)));
  }

  async create(
    auth: AuthContext,
    budgetId: string,
    input: RecurringRuleCreate,
  ): Promise<RecurringRuleView> {
    const { budget, membership } = await this.access.require(
      budgetId,
      auth.userId,
      'transactions.write',
    );
    const payer =
      input.payer.kind === 'member' ? input.payer.membershipId : null;
    validatePayment(input.payer, input.paymentMethod);
    await this.assertSeries(budgetId, input.seriesId, membership.id);
    const now = this.clock.now();
    const rule: RecurringRuleRecord = {
      id: this.ids.next(),
      budgetId,
      label: input.label.normalize('NFC').trim(),
      amountMinor: BigInt(input.amountMinor),
      currency: budget.currency,
      dayOfMonth: input.dayOfMonth,
      payerMembershipId: payer,
      paymentMethod: input.paymentMethod,
      seriesId: input.seriesId,
      isShared: input.isShared ?? false,
      active: true,
      startsOn: input.startsOn,
      version: 1,
      createdAt: now,
      createdBy: membership.id,
      updatedAt: now,
      updatedBy: membership.id,
    };
    await this.rules.save(rule);
    await this.record(budget, membership.id, rule, 'created', null, rule);
    return this.view(rule, budget);
  }

  async patch(
    auth: AuthContext,
    budgetId: string,
    id: string,
    input: RecurringRulePatch,
  ): Promise<RecurringRuleView> {
    const { budget, membership } = await this.access.require(
      budgetId,
      auth.userId,
      'transactions.write',
    );
    const rule = await this.rules.findById(budgetId, id);
    if (!rule) throw new DomainError('NOT_FOUND');
    if (rule.version !== input.expectedVersion)
      throw new DomainError('STALE_STATE', {
        current: await this.view(rule, budget),
      });
    if (input.seriesId !== undefined)
      await this.assertSeries(budgetId, input.seriesId, membership.id);
    const payer =
      input.payer === undefined
        ? rule.payerMembershipId
        : input.payer.kind === 'member'
          ? input.payer.membershipId
          : null;
    const next: RecurringRuleRecord = {
      ...rule,
      label: input.label?.normalize('NFC').trim() ?? rule.label,
      amountMinor:
        input.amountMinor !== undefined
          ? BigInt(input.amountMinor)
          : rule.amountMinor,
      dayOfMonth: input.dayOfMonth ?? rule.dayOfMonth,
      payerMembershipId: payer,
      paymentMethod: input.paymentMethod ?? rule.paymentMethod,
      seriesId: input.seriesId !== undefined ? input.seriesId : rule.seriesId,
      isShared: input.isShared ?? rule.isShared,
      active: input.active ?? rule.active,
      version: rule.version + 1,
      updatedAt: this.clock.now(),
      updatedBy: membership.id,
    };
    validatePayment(
      payer ? { kind: 'member', membershipId: payer } : { kind: 'joint' },
      next.paymentMethod,
    );
    await this.rules.save(next);
    await this.record(budget, membership.id, next, 'updated', rule, next);
    return this.view(next, budget);
  }

  async remove(
    auth: AuthContext,
    budgetId: string,
    id: string,
    expectedVersion: number,
  ): Promise<void> {
    const { budget, membership } = await this.access.require(
      budgetId,
      auth.userId,
      'transactions.write',
    );
    const rule = await this.rules.findById(budgetId, id);
    if (!rule) return;
    if (rule.version !== expectedVersion)
      throw new DomainError('STALE_STATE', {
        current: await this.view(rule, budget),
      });
    await this.rules.delete(id);
    await this.record(budget, membership.id, rule, 'deleted', rule, null);
  }
}

/**
 * Creates due recurring transactions exactly once (R9, FR-036–FR-037): from the hourly job, and
 * when a month is created later than its occurrences (through the planning hooks).
 */
@Injectable()
export class MaterializeRecurring implements OnModuleInit {
  private readonly logger = new Logger(MaterializeRecurring.name);

  constructor(
    hooks: TrackingHooks,
    private readonly writer: MonthWriter,
    private readonly txnWriter: TxnWriter,
    @Inject(RECURRING_RULE_REPOSITORY)
    private readonly rules: RecurringRuleRepository,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly txns: TransactionRepository,
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(PUSH_DEVICE_REPOSITORY)
    private readonly devices: PushDeviceRepository,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.hooks = hooks;
  }

  private readonly hooks: TrackingHooks;

  onModuleInit(): void {
    this.hooks.onMonthCreated({
      monthCreated: (ctx) => this.forMonth(ctx).then(() => undefined),
    });
  }

  /** Inside a month write: creates every due occurrence of every active rule. Returns how many. */
  async forMonth(ctx: MonthContext): Promise<number> {
    const today = ctx.budget.today(ctx.now);
    let created = 0;
    for (const rule of await this.rules.list(ctx.budget.id)) {
      for (const date of dueOccurrences(rule, ctx.month.period, today)) {
        if (ctx.month.status === 'closed') {
          if (await this.rules.recordSkip(rule.id, date, ctx.now))
            await this.notifySkip(ctx.budget.id);
          continue;
        }
        const line = rule.seriesId
          ? ctx.lines.find((l) => l.seriesId === rule.seriesId)
          : undefined;
        const txn: TxnRecord = normalizeTxn({
          id: ctx.newId(),
          budgetId: ctx.budget.id,
          monthId: ctx.month.id,
          date,
          amountMinor: rule.amountMinor,
          currency: rule.currency,
          isRefund: false,
          label: rule.label,
          labelNormalized: normalizeLabel(rule.label),
          payerMembershipId: rule.payerMembershipId,
          paymentMethod: rule.paymentMethod,
          isPlanned: true,
          plannedSetByHand: true,
          isShared: line ? line.group !== 'personal' : rule.isShared,
          note: null,
          origin: 'recurring',
          recurringRuleId: rule.id,
          scheduledDate: date,
          importKey: null,
          version: 1,
          createdAt: ctx.now,
          createdBy: null,
          updatedAt: ctx.now,
          updatedBy: null,
          parts: line
            ? [
                {
                  id: ctx.newId(),
                  lineId: line.id,
                  subItemId: null,
                  amountMinor: rule.amountMinor,
                  needsReview: false,
                  position: 0,
                },
              ]
            : rule.seriesId
              ? [
                  {
                    id: ctx.newId(),
                    lineId: null,
                    subItemId: null,
                    amountMinor: rule.amountMinor,
                    needsReview: true,
                    position: 0,
                  },
                ]
              : [],
          receipts: [],
        });
        if (await this.txns.insertRecurring(txn)) {
          created += 1;
          await this.txnWriter.record(
            ctx,
            txn,
            'created',
            null,
            txnSnapshot(txn),
            { cause: 'recurring' },
          );
        }
      }
    }
    return created;
  }

  /** One budget: its current month, under the month lock, as the system. */
  async forBudget(budgetId: string): Promise<number> {
    return this.tx.run(async () => {
      const budget = await this.budgets.findById(budgetId);
      if (!budget || budget.isDeleted) return 0;
      const now = this.clock.now();
      const month = await this.months.findByStart(
        budgetId,
        budget.currentMonth(now).start,
        { forUpdate: true },
      );
      if (!month) return 0; // created later: the create-month hook catches up (FR-037)
      const owner = (await this.memberships.listByBudget(budgetId)).find(
        (m) => m.isOwner && m.isCurrent,
      );
      if (!owner) return 0;
      const ctx = await this.writer.context(budget, owner, month, 'recurring');
      const created = await this.forMonth(ctx);
      if (created > 0) await this.months.bumpRevision(month.id);
      return created;
    });
  }

  /** The hourly job: budgets whose local time is past 06:00 (R9). */
  async runDue(): Promise<number> {
    let total = 0;
    for (const budgetId of await this.rules.budgetsWithActiveRules()) {
      try {
        const budget = await this.budgets.findById(budgetId);
        if (!budget) continue;
        const hour = Number(
          new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            hourCycle: 'h23',
            timeZone: budget.timeZone,
          }).format(this.clock.now()),
        );
        if (hour < 6) continue;
        total += await this.forBudget(budgetId);
      } catch (error) {
        // No amounts or labels in logs (Principle III).
        this.logger.error(
          { err: (error as Error).name },
          'recurring materialization failed',
        );
      }
    }
    return total;
  }

  /** "Une opération récurrente n'a pas pu être créée", no label or amount (Principle III). */
  private async notifySkip(budgetId: string): Promise<void> {
    try {
      const members = (await this.memberships.listByBudget(budgetId)).filter(
        (m) => m.isCurrent && m.userId,
      );
      const tokens = await this.devices.tokensForUsers(
        members.map((m) => m.userId!),
      );
      if (tokens.length)
        await this.push.send([
          {
            to: tokens,
            title: 'Two Cents',
            body: "Une opération récurrente n'a pas pu être créée : le mois est clôturé.",
            data: { budgetId, kind: 'recurring_skipped' },
          },
        ]);
    } catch (error) {
      this.logger.warn({ err: (error as Error).name }, 'push not delivered');
    }
  }
}
