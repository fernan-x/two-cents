import type { PaymentMethod } from '@two-cents/shared/domain';
import type { TxnRecord } from '../entities/transaction';

export interface TransactionRepository {
  findById(id: string): Promise<TxnRecord | null>;
  listForMonth(monthId: string): Promise<TxnRecord[]>;
  /** Inserts the transaction and its parts. */
  insert(txn: TxnRecord): Promise<void>;
  /** Updates the transaction and replaces its parts. */
  update(txn: TxnRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** FR-045: parts on that line become unassigned and flagged. Returns the month ids touched. */
  unassignLine(lineId: string): Promise<string[]>;
  /** Where a line id lives, to tell "another month" from "deleted" (FR-016). */
  monthOfLine(lineId: string): Promise<string | null>;
  /** Hint aggregates over the budget's transactions since `since` (research R6). */
  hints(
    budgetId: string,
    since: Date,
    viewerMembershipId: string,
  ): Promise<{
    labels: {
      normalizedLabel: string;
      seriesId: string;
      count: number;
      lastUsedAt: Date;
    }[];
    mostUsed: { seriesId: string; count: number }[];
    lastMethods: {
      payerMembershipId: string | null;
      paymentMethod: PaymentMethod;
    }[];
    latestUpdate: Date | null;
  }>;
  /** Recurring occurrence already created (R9). */
  insertRecurring(txn: TxnRecord): Promise<boolean>;
  /** Transactions with any of these import keys (R11). */
  findByImportKeys(
    budgetId: string,
    keys: readonly string[],
  ): Promise<TxnRecord[]>;
}
export const TRANSACTION_REPOSITORY = Symbol('TransactionRepository');

export interface ReceiptRecord {
  id: string;
  txnId: string;
  contentType: string;
  bytes: Buffer;
  createdAt: Date;
  createdBy: string | null;
}

/** Receipt photo bytes (research R10); swappable for object storage later. */
export interface ReceiptStore {
  count(txnId: string): Promise<number>;
  find(txnId: string, id: string): Promise<ReceiptRecord | null>;
  /** False when the id already exists. */
  insert(receipt: ReceiptRecord): Promise<boolean>;
  delete(txnId: string, id: string): Promise<void>;
  listForBudget(budgetId: string): Promise<ReceiptRecord[]>;
}
export const RECEIPT_STORE = Symbol('ReceiptStore');

export interface SettlementRecord {
  id: string;
  budgetId: string;
  monthId: string;
  fromMembershipId: string;
  toMembershipId: string;
  amountMinor: bigint;
  createdAt: Date;
  createdBy: string | null;
}

export interface SettlementRepository {
  listForMonth(monthId: string): Promise<SettlementRecord[]>;
  insert(s: SettlementRecord): Promise<void>;
}
export const SETTLEMENT_REPOSITORY = Symbol('SettlementRepository');

export interface RecurringRuleRecord {
  id: string;
  budgetId: string;
  label: string;
  amountMinor: bigint;
  currency: string;
  dayOfMonth: number;
  payerMembershipId: string | null;
  paymentMethod: PaymentMethod;
  seriesId: string | null;
  isShared: boolean;
  active: boolean;
  startsOn: string;
  version: number;
  createdAt: Date;
  createdBy: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface RecurringRuleRepository {
  list(budgetId: string): Promise<RecurringRuleRecord[]>;
  /** Budgets holding at least one active rule (the daily job, R9). */
  budgetsWithActiveRules(): Promise<string[]>;
  /** The latest line of a 003 recurring series in this budget, if any. */
  seriesInfo(
    budgetId: string,
    seriesId: string,
  ): Promise<{
    group: 'personal' | 'recurring_shared' | 'one_off_shared';
    ownerMembershipId: string | null;
    label: string;
  } | null>;
  findById(budgetId: string, id: string): Promise<RecurringRuleRecord | null>;
  save(rule: RecurringRuleRecord): Promise<void>;
  delete(id: string): Promise<void>;
  /** False when that skip was already recorded (notify once). */
  recordSkip(
    ruleId: string,
    scheduledDate: string,
    now: Date,
  ): Promise<boolean>;
}
export const RECURRING_RULE_REPOSITORY = Symbol('RecurringRuleRepository');

export interface CsvMappingRepository {
  find(
    budgetId: string,
    fingerprint: string,
  ): Promise<Record<string, unknown> | null>;
  upsert(
    budgetId: string,
    fingerprint: string,
    mapping: Record<string, unknown>,
    by: string,
    now: Date,
    id: string,
  ): Promise<void>;
}
export const CSV_MAPPING_REPOSITORY = Symbol('CsvMappingRepository');

/** Counts only: no label, amount or line (FR-013). */
export interface SuggestionStats {
  increment(
    budgetId: string,
    membershipId: string,
    day: string,
    outcome: 'kept' | 'changed',
  ): Promise<void>;
}
export const SUGGESTION_STATS = Symbol('SuggestionStats');
