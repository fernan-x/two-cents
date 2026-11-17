import { Inject, Injectable } from '@nestjs/common';
import type {
  TemplateLine,
  TemplateSummary,
} from '@two-cents/shared/contracts';
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
import {
  LINE_REPOSITORY,
  type LineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
  TEMPLATE_REPOSITORY,
  type TemplateRecord,
  type TemplateRepository,
} from '../../domain/ports/repositories';

const summary = (t: TemplateRecord): TemplateSummary => ({
  id: t.id,
  name: t.name,
  lineCount: t.lines.length,
  updatedAt: t.updatedAt.toISOString(),
});

/**
 * US2: month templates (FR-007, research R15). A template keeps a month's lines without incomes; it
 * keeps the saver's own private lines (still private) and never another member's private lines.
 */
@Injectable()
export class Templates {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(TEMPLATE_REPOSITORY) private readonly templates: TemplateRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async list(auth: AuthContext, budgetId: string): Promise<TemplateSummary[]> {
    await this.access.require(budgetId, auth.userId, 'budget.read');
    return (await this.templates.list(budgetId)).map(summary);
  }

  save(
    auth: AuthContext,
    budgetId: string,
    name: string,
    fromMonthStart: string,
  ): Promise<TemplateSummary> {
    return this.tx.run(async () => {
      const { membership } = await this.access.require(
        budgetId,
        auth.userId,
        'entries.write',
        {
          forUpdate: true,
        },
      );
      if (await this.templates.nameTaken(budgetId, name))
        throw new DomainError('TEMPLATE_NAME_TAKEN');
      const month = await this.months.findByStart(budgetId, fromMonthStart);
      if (!month) throw new DomainError('MONTH_NOT_FOUND');
      const lines: TemplateLine[] = (await this.lines.listForMonth(month.id))
        .filter((l) => !l.isPrivate || l.ownerMembershipId === membership.id)
        .map((l) => {
          // The usual values, not a "this month only" exception.
          const a = l.usual ?? l.amountFields();
          return {
            group: l.group,
            kind: l.kind,
            label: l.label,
            categoryId: l.categoryId,
            isEnvelope: l.isEnvelope,
            subItems: l.subItems.map((s) => ({
              label: s.label,
              amountMinor: s.amountMinor?.toString() ?? null,
            })),
            ownerMembershipId: l.ownerMembershipId,
            isPrivate: l.isPrivate,
            splitMode: a.splitMode,
            payerMembershipId: a.payerMembershipId,
            totalMinor: a.totalMinor.toString(),
            shares: Object.entries(a.shares).map(([membershipId, v]) => ({
              membershipId,
              amountMinor: v.toString(),
            })),
            formula: a.formula
              ? {
                  kind: a.formula.kind,
                  baseMinor: a.formula.baseMinor.toString(),
                  factor: a.formula.factor,
                }
              : null,
            position: l.position,
          };
        });
      const now = this.clock.now();
      const record: TemplateRecord = {
        id: this.ids.next(),
        budgetId,
        name,
        lines,
        createdBy: membership.id,
        createdAt: now,
        updatedAt: now,
      };
      await this.templates.save(record);
      return summary(record);
    });
  }

  rename(
    auth: AuthContext,
    budgetId: string,
    id: string,
    name: string,
  ): Promise<TemplateSummary> {
    return this.tx.run(async () => {
      await this.access.require(budgetId, auth.userId, 'entries.write', {
        forUpdate: true,
      });
      const template = await this.templates.findById(budgetId, id);
      if (!template) throw new DomainError('NOT_FOUND');
      if (await this.templates.nameTaken(budgetId, name, id))
        throw new DomainError('TEMPLATE_NAME_TAKEN');
      const updated = { ...template, name, updatedAt: this.clock.now() };
      await this.templates.save(updated);
      return summary(updated);
    });
  }

  remove(auth: AuthContext, budgetId: string, id: string): Promise<void> {
    return this.tx.run(async () => {
      await this.access.require(budgetId, auth.userId, 'entries.write');
      const template = await this.templates.findById(budgetId, id);
      if (!template) throw new DomainError('NOT_FOUND');
      await this.templates.delete(id);
    });
  }
}
