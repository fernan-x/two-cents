import { Global, Module } from '@nestjs/common';
import { getDrizzleToken } from '@nestjs/drizzle';
import {
  OutboxModule as NestOutboxModule,
  OutboxStorage,
} from '@nestjs/outbox';
import { fromDrizzle, PostgresOutboxStore } from '@nestjs/outbox/postgres';
import { EVENT_PUBLISHER } from '../../application/ports';
import { ENV, type Env } from '../config/env';
import type { Database } from '../db/database';
import { OutboxEventPublisher } from './outbox-event-publisher';
import { OutboxRetentionJob } from './outbox-retention.job';

/**
 * Transactional outbox (spec 002 research R9): messages are written in the business transaction and
 * delivered by the relay after commit, with retries and dead letters. Its `nest_outbox` schema is
 * created by the drizzle migration `0003_nest_outbox.sql`, so the store never migrates by itself.
 */
@Global()
@Module({
  imports: [
    NestOutboxModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        // Tests drain the outbox explicitly (OutboxRelay.runOnce) instead of polling.
        relay: { enabled: env.NODE_ENV !== 'test', pollInterval: '1s' },
        retry: { attempts: 20, backoff: { delay: '1s', maxDelay: '5m' } },
      }),
    }),
  ],
  providers: [
    {
      provide: PostgresOutboxStore,
      inject: [getDrizzleToken(), OutboxStorage],
      useFactory: (db: Database, storage: OutboxStorage) =>
        new PostgresOutboxStore(
          { executor: fromDrizzle(db), migrate: false },
          storage,
        ),
    },
    OutboxEventPublisher,
    { provide: EVENT_PUBLISHER, useExisting: OutboxEventPublisher },
    OutboxRetentionJob,
  ],
  exports: [EVENT_PUBLISHER],
})
export class OutboxModule {}
