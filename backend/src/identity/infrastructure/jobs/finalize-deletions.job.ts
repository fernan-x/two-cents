import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { Cron } from '@nestjs/schedule';
import type { Database } from '../../../shared-kernel/infrastructure/db/database';
import { FinalizeDeletion } from '../../application/use-cases/account-deletion';

const LOCK_KEY = 1_001_042; // spec 001, FR-042

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
    // A session-level advisory lock on a dedicated connection: only one instance runs the job at a time.
    const client = await this.db.$client.connect();
    try {
      const { rows } = await client.query<{ locked: boolean }>(
        'SELECT pg_try_advisory_lock($1) AS locked',
        [LOCK_KEY],
      );
      if (!rows[0]?.locked) return 0;
      try {
        const deleted = await this.finalize.execute();
        if (deleted > 0)
          this.logger.log({ deleted }, 'accounts permanently deleted');
        return deleted;
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
      }
    } catch (error) {
      this.logger.error({ err: error }, 'finalize deletions failed');
      return 0;
    } finally {
      client.release();
    }
  }
}
