import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { adaptAmounts } from '@two-cents/shared/domain';
import { MembershipHooks } from '../../../budgets/application/services/membership-hooks';
import {
  BUDGET_REPOSITORY,
  type BudgetRepository,
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../../budgets/domain/ports/repositories';
import {
  LINE_REPOSITORY,
  type LineRepository,
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../domain/ports/repositories';
import { diff, lineSnapshot } from './history';
import { MonthWriter } from './month-writer';
import { toPlanIncomes } from './plan-mapping';

/**
 * Research R8: when someone joins, every open month they count in gets a 0 share on its shared lines,
 * and equal or proportional lines are recomputed to include them (cause `recompute`). Departures
 * change nothing in the current month (002 FR-033); later copies drop the person (copy rules).
 */
@Injectable()
export class MonthMembershipSync implements OnModuleInit {
  constructor(
    private readonly hooks: MembershipHooks,
    private readonly writer: MonthWriter,
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
  ) {}

  onModuleInit(): void {
    this.hooks.onJoined(this);
  }

  async memberJoined(budgetId: string, membershipId: string): Promise<void> {
    const budget = await this.budgets.findById(budgetId);
    const joined = await this.memberships.findById(membershipId);
    if (!budget || !joined) return;
    for (const open of await this.months.listOpen(budgetId)) {
      const month = await this.months.findById(open.id, { forUpdate: true });
      if (!month) continue;
      // The new member is the actor: the change happened because they joined.
      const ctx = await this.writer.context(budget, joined, month, 'recompute');
      if (!ctx.members.some((m) => m.id === membershipId)) continue;
      let changed = false;
      for (const line of ctx.lines) {
        if (line.group === 'personal') continue;
        const adapted = adaptAmounts(
          {
            ...line.amountFields(),
            group: line.group,
            ownerMembershipId: null,
          },
          ctx.planMembers,
          toPlanIncomes(ctx.incomes),
        );
        const before = lineSnapshot(line);
        line.update(
          { ...adapted.amounts, needsIncome: adapted.needsIncome },
          joined.id,
          ctx.now,
        );
        const changes = diff(before, lineSnapshot(line));
        if (changes.length === 0) continue;
        await this.lines.save(line);
        changed = true;
        // A 0 share added for the newcomer is not worth a history line on its own.
        const meaningful = changes.filter(
          (c) => !(c.old === null && c.new === '0'),
        );
        if (meaningful.length > 0)
          await ctx.record({
            entity: 'line',
            entityId: line.id,
            action: 'updated',
            isPrivate: false,
            ownerMembershipId: null,
            labelSnapshot: line.label,
            changes: meaningful,
          });
      }
      if (changed) await this.months.bumpRevision(month.id);
    }
  }
}
