import { Inject, Injectable } from '@nestjs/common';
import { adaptAmounts, shouldPropagate } from '@two-cents/shared/domain';
import type {
  AmountFields,
  BudgetLine,
} from '../../domain/entities/budget-line';
import {
  LINE_REPOSITORY,
  type LineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../domain/ports/repositories';
import { diff, lineSnapshot } from './history';
import { MonthWriter, type MonthContext } from './month-writer';
import { toPlanIncomes } from './plan-mapping';

/**
 * "From this month on" (FR-025, clarification Q1 → B, research R7): the new amounts reach every
 * later month of the series that is Draft and whose line was not edited by hand. Each touched month
 * gets a revision bump and a `propagation` history record.
 */
@Injectable()
export class PropagateRecurring {
  constructor(
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
    @Inject(MonthWriter) private readonly writer: MonthWriter,
  ) {}

  async run(
    source: MonthContext,
    line: BudgetLine,
    _usualBefore: AmountFields | null,
  ): Promise<void> {
    const later = await this.months.listAfter(
      source.budget.id,
      source.month.periodStart,
    );
    for (const candidate of later) {
      if (candidate.status !== 'draft') continue;
      const month = await this.months.findById(candidate.id, {
        forUpdate: true,
      });
      if (!month || month.status !== 'draft') continue;
      const ctx = await this.writer.context(
        source.budget,
        source.me,
        month,
        'propagation',
      );
      const target = ctx.lines.find((l) => l.seriesId === line.seriesId);
      if (
        !target ||
        !shouldPropagate({
          laterMonthStatus: month.status,
          handEdited: target.handEdited,
        })
      )
        continue;
      const adapted = adaptAmounts(
        {
          ...line.amountFields(),
          group: target.group,
          ownerMembershipId: target.ownerMembershipId,
        },
        ctx.planMembers,
        toPlanIncomes(ctx.incomes),
      );
      const before = lineSnapshot(target);
      target.update(
        {
          ...adapted.amounts,
          usual: null,
          needsReview: adapted.needsReview,
          needsIncome: adapted.needsIncome,
        },
        source.me.id,
        ctx.now,
      );
      const changes = diff(before, lineSnapshot(target));
      if (changes.length === 0) continue;
      await this.lines.save(target);
      await ctx.record({
        entity: 'line',
        entityId: target.id,
        action: 'updated',
        isPrivate: target.isPrivate,
        ownerMembershipId: target.ownerMembershipId,
        labelSnapshot: target.label,
        changes,
      });
      await this.months.bumpRevision(month.id);
    }
  }
}
