import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Cron } from '@nestjs/schedule';
import type { Database } from '../../../shared-kernel/infrastructure/db/database';
import {
  LOCK_KEYS,
  withAdvisoryLock,
} from '../../../shared-kernel/infrastructure/db/advisory-lock';
import { MaterializeRecurring } from '../../application/use-cases/recurring';

/**
 * Spec 004 research R9: every hour, creates the recurring transactions that are due in budgets
 * whose local time is past 06:00. Exactly once thanks to the (rule, date) unique index; single
 * instance through an advisory lock.
 */
@Injectable()
export class RecurringJob {
  private readonly logger = new Logger(RecurringJob.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly materialize: MaterializeRecurring,
  ) {}

  @Cron('5 * * * *')
  async run(): Promise<number> {
    try {
      return (
        (await withAdvisoryLock(this.db, LOCK_KEYS.materializeRecurring, () =>
          this.materialize.runDue(),
        )) ?? 0
      );
    } catch (error) {
      this.logger.error({ err: (error as Error).name }, 'recurring job failed');
      return 0;
    }
  }
}
