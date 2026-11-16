import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Cron } from '@nestjs/schedule';
import type { Database } from '../../../shared-kernel/infrastructure/db/database';
import {
  LOCK_KEYS,
  withAdvisoryLock,
} from '../../../shared-kernel/infrastructure/db/advisory-lock';
import { FinalizeDeletion } from '../../application/use-cases/account-deletion';

/** Every 15 minutes, permanently deletes accounts whose 7-day grace period is over (research R12). */
@Injectable()
export class FinalizeDeletionsJob {
  private readonly logger = new Logger(FinalizeDeletionsJob.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly finalize: FinalizeDeletion,
  ) {}

  @Cron('*/15 * * * *')
  async run(): Promise<number> {
    try {
      const deleted =
        (await withAdvisoryLock(this.db, LOCK_KEYS.finalizeDeletions, () =>
          this.finalize.execute(),
        )) ?? 0;
      if (deleted > 0)
        this.logger.log({ deleted }, 'accounts permanently deleted');
      return deleted;
    } catch (error) {
      this.logger.error({ err: error }, 'finalize deletions failed');
      return 0;
    }
  }
}
