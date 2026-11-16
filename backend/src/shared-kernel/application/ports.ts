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
