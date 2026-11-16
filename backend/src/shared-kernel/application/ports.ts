import type { OutboxPayloads, OutboxTopic } from '@two-cents/shared/contracts';

export interface Clock {
  now(): Date;
}
export const CLOCK = Symbol('Clock');

export interface IdGenerator {
  /** Time-ordered UUID v7. */
  next(): string;
}
export const ID_GENERATOR = Symbol('IdGenerator');

export interface TransactionRunner {
  /** Runs `work` in one database transaction; nested calls join the outer transaction. */
  run<T>(work: () => Promise<T>): Promise<T>;
  /** Runs `work` after the current transaction commits (immediately when there is none). */
  afterCommit(work: () => Promise<void> | void): void;
}
export const TRANSACTION_RUNNER = Symbol('TransactionRunner');

/** Reliable messages sent after the current transaction commits (spec 002 research R9, R15). */
export interface EventPublisher {
  /** Adds the message to the current transaction; it is delivered only if the transaction commits. */
  publish<T extends OutboxTopic>(
    topic: T,
    payload: OutboxPayloads[T],
  ): Promise<void>;
}
export const EVENT_PUBLISHER = Symbol('EventPublisher');

export interface PushMessage {
  /** Expo push tokens. */
  to: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

/** Best-effort push notifications (spec 002 research R8). */
export interface PushSender {
  send(messages: PushMessage[]): Promise<void>;
}
export const PUSH_SENDER = Symbol('PushSender');
