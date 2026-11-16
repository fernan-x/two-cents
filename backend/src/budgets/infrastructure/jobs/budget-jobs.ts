import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Cron } from '@nestjs/schedule';
import type { Database } from '../../../shared-kernel/infrastructure/db/database';
import {
  LOCK_KEYS,
  withAdvisoryLock,
} from '../../../shared-kernel/infrastructure/db/advisory-lock';
import { PurgeBudgets } from '../../application/use-cases/budgets';
import { ExpireInvitations } from '../../application/use-cases/invitations';

/** Scheduled budget jobs (research R12), each single-instance through an advisory lock. */
@Injectable()
export class BudgetJobs {
  private readonly logger = new Logger(BudgetJobs.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly expire: ExpireInvitations,
    private readonly purge: PurgeBudgets,
  ) {}

  /** Tidies expired invitations; reads already treat them as expired. */
  @Cron('*/15 * * * *')
  async expireInvitations(): Promise<number> {
    try {
      return (
        (await withAdvisoryLock(this.db, LOCK_KEYS.expireInvitations, () =>
          this.expire.execute(),
        )) ?? 0
      );
    } catch (error) {
      this.logger.error({ err: error }, 'expire invitations failed');
      return 0;
    }
  }

  /** FR-038b: erases budgets deleted 30 days ago or more. */
  @Cron('0 3 * * *', { timeZone: 'Europe/Paris' })
  async purgeBudgets(): Promise<number> {
    try {
      const purged =
        (await withAdvisoryLock(this.db, LOCK_KEYS.purgeBudgets, () =>
          this.purge.execute(),
        )) ?? 0;
      if (purged > 0) this.logger.log({ purged }, 'deleted budgets purged');
      return purged;
    } catch (error) {
      this.logger.error({ err: error }, 'purge budgets failed');
      return 0;
    }
  }
}
