import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { PlanningHooks } from '../../../planning/application/services/planning-hooks';
import type { MonthContext } from '../../../planning/application/services/month-writer';
import {
  MONTH_REPOSITORY,
  type MonthRepository,
} from '../../../planning/domain/ports/repositories';
import {
  TRANSACTION_REPOSITORY,
  type TransactionRepository,
} from '../../domain/ports/repositories';

/** Optional: recurring occurrences are added by US8 (FR-037). */
export interface MonthCreatedListener {
  monthCreated(ctx: MonthContext): Promise<void>;
}

/** Registers tracking with the 003 planning hooks at startup (research R13, FR-045). */
@Injectable()
export class TrackingHooks implements OnModuleInit {
  private readonly listeners: MonthCreatedListener[] = [];

  constructor(
    private readonly hooks: PlanningHooks,
    @Inject(TRANSACTION_REPOSITORY)
    private readonly txns: TransactionRepository,
    @Inject(MONTH_REPOSITORY) private readonly months: MonthRepository,
  ) {}

  onMonthCreated(listener: MonthCreatedListener): void {
    this.listeners.push(listener);
  }

  onModuleInit(): void {
    this.hooks.register({
      lineDeleting: async (lineId) => {
        const touched = await this.txns.unassignLine(lineId);
        // Other months holding parts of this line (moved transactions) must refresh too.
        for (const monthId of touched) await this.months.bumpRevision(monthId);
      },
      monthCreated: async (ctx) => {
        for (const l of this.listeners) await l.monthCreated(ctx);
      },
    });
  }
}
