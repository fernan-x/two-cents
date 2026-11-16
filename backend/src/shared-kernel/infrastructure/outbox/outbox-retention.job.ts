import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { OutboxDeadLetters, OutboxInbox } from '@nestjs/outbox';
import { Cron } from '@nestjs/schedule';
import type { Database } from '../db/database';
import { LOCK_KEYS, withAdvisoryLock } from '../db/advisory-lock';

const DAY_MS = 86_400_000;

/**
 * Outbox payloads hold recipient emails and names, so they are not kept longer than needed
 * (Principle III, research R9). Published messages are deleted by the relay on publish; this prunes
 * the inbox after 30 days and the dead letters after 14.
 */
@Injectable()
export class OutboxRetentionJob {
  private readonly logger = new Logger(OutboxRetentionJob.name);

  constructor(
    @InjectDrizzle() private readonly db: Database,
    private readonly inbox: OutboxInbox,
    private readonly deadLetters: OutboxDeadLetters,
  ) {}

  @Cron('30 3 * * *', { timeZone: 'Europe/Paris' })
  async run(): Promise<void> {
    try {
      await withAdvisoryLock(this.db, LOCK_KEYS.outboxRetention, async () => {
        const purged = await this.deadLetters.purge({
          failedBefore: new Date(Date.now() - 14 * DAY_MS),
        });
        const pruned = await this.inbox.prune('30d');
        this.logger.log({ purged, pruned }, 'outbox retention applied');
      });
    } catch (error) {
      this.logger.error({ err: error }, 'outbox retention failed');
    }
  }
}
