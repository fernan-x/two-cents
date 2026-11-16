import { Injectable } from '@nestjs/common';
import { Outbox } from '@nestjs/outbox';
import type { OutboxPayloads, OutboxTopic } from '@two-cents/shared/contracts';
import type { EventPublisher } from '../../application/ports';
import { DrizzleTransactionRunner } from '../db/drizzle-transaction-runner';

/**
 * EventPublisher adapter: adds the message through the transaction the use case runs in, and wakes
 * the relay after commit. Outside a transaction it opens one, so a message is never lost.
 */
@Injectable()
export class OutboxEventPublisher implements EventPublisher {
  constructor(
    private readonly outbox: Outbox,
    private readonly transactions: DrizzleTransactionRunner,
  ) {}

  publish<T extends OutboxTopic>(
    topic: T,
    payload: OutboxPayloads[T],
  ): Promise<void> {
    return this.transactions.run(async () => {
      await this.outbox.add(this.transactions.executor(), { topic, payload });
      this.transactions.afterCommit(() => this.outbox.notify());
    });
  }
}
