import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, Logger } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { TransactionRunner } from '../../application/ports';
import type { Database, DbExecutor } from './database';

interface TxContext {
  tx: DbExecutor;
  afterCommit: Array<() => Promise<void> | void>;
}

/**
 * TransactionRunner adapter. The open transaction is kept in an AsyncLocalStorage so
 * repositories pick it up through `executor()` without it appearing in use-case code.
 */
@Injectable()
export class DrizzleTransactionRunner implements TransactionRunner {
  private readonly logger = new Logger(DrizzleTransactionRunner.name);
  private readonly storage = new AsyncLocalStorage<TxContext>();

  constructor(@InjectDrizzle() private readonly db: Database) {}

  /** The current transaction, or the database when none is open. */
  executor(): DbExecutor {
    return this.storage.getStore()?.tx ?? this.db;
  }

  async run<T>(work: () => Promise<T>): Promise<T> {
    if (this.storage.getStore()) return work();
    const callbacks: TxContext['afterCommit'] = [];
    const result = await this.db.transaction((tx) =>
      this.storage.run({ tx, afterCommit: callbacks }, work),
    );
    for (const callback of callbacks) {
      try {
        await callback();
      } catch (error) {
        this.logger.error({ err: error }, 'after-commit callback failed');
      }
    }
    return result;
  }

  afterCommit(work: () => Promise<void> | void): void {
    const context = this.storage.getStore();
    if (context) {
      context.afterCommit.push(work);
      return;
    }
    void Promise.resolve()
      .then(work)
      .catch((error: unknown) =>
        this.logger.error({ err: error }, 'after-commit callback failed'),
      );
  }
}
