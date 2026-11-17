import { Inject, Injectable } from '@nestjs/common';
import { computeShares } from '@two-cents/shared/domain';
import {
  LINE_REPOSITORY,
  type LineRepository,
} from '../../domain/ports/repositories';
import { diff, lineSnapshot } from './history';
import type { MonthContext } from './month-writer';
import { toPlanIncomes } from './plan-mapping';

/**
 * FR-022 / research R9: after an income change, every proportional line of the month gets new
 * shares in the same transaction. With no counted income the line keeps its shares and is flagged
 * `needs_income`. Recomputes are recorded with cause `recompute` and do not set `hand_edited`.
 */
@Injectable()
export class RecomputeProportional {
  constructor(
    @Inject(LINE_REPOSITORY) private readonly lines: LineRepository,
  ) {}

  async run(ctx: MonthContext): Promise<void> {
    const incomes = toPlanIncomes(ctx.incomes);
    const anyIncome = incomes.some((i) => i.counts && i.amount > 0n);
    for (const line of ctx.lines) {
      if (line.splitMode !== 'proportional') continue;
      const before = lineSnapshot(line);
      if (!anyIncome) {
        if (line.needsIncome) continue;
        line.update({ needsIncome: true }, ctx.me.id, ctx.now);
        await this.lines.save(line);
        continue;
      }
      const { shares } = computeShares({
        mode: 'proportional',
        total: line.totalMinor,
        members: ctx.planMembers,
        incomes,
      });
      const changes = diff(before, { ...before, ...sharesSnapshot(shares) });
      if (changes.length === 0 && !line.needsIncome) continue;
      line.update({ shares, needsIncome: false }, ctx.me.id, ctx.now);
      await this.lines.save(line);
      if (changes.length > 0)
        await ctx.record({
          cause: 'recompute',
          entity: 'line',
          entityId: line.id,
          action: 'updated',
          isPrivate: false,
          ownerMembershipId: null,
          labelSnapshot: line.label,
          changes,
        });
    }
  }
}

const sharesSnapshot = (shares: Record<string, bigint>) =>
  Object.fromEntries(
    Object.entries(shares).map(([id, v]) => [`share:${id}`, v.toString()]),
  );
