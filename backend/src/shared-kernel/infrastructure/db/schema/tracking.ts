import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { budgets, memberships } from './budgets';
import { budgetLines, budgetMonths, envelopeSubItems } from './planning';

// Tables for spec 004 (transaction tracking). See specs/004-transaction-tracking/data-model.md.

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const paymentMethod = pgEnum('payment_method', [
  'personal_card',
  'joint_card',
  'meal_voucher',
  'cash',
  'transfer',
]);
export const txnOrigin = pgEnum('txn_origin', [
  'quick_add',
  'edit_form',
  'paid_as_planned',
  'recurring',
  'import',
]);
export const recurringSkipReason = pgEnum('recurring_skip_reason', [
  'month_closed',
]);

export const recurringTxnRules = pgTable(
  'recurring_txn_rule',
  {
    id: uuid('id').primaryKey(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    dayOfMonth: smallint('day_of_month').notNull(),
    /** Null = joint account. */
    payerMembershipId: uuid('payer_membership_id').references(
      () => memberships.id,
    ),
    paymentMethod: paymentMethod('payment_method').notNull(),
    /** 003 recurring series of the target line; null = unassigned. */
    seriesId: uuid('series_id'),
    isShared: boolean('is_shared').notNull().default(false),
    active: boolean('active').notNull().default(true),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    version: integer('version').notNull().default(1),
    createdAt: ts('created_at').notNull(),
    createdBy: uuid('created_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
    updatedAt: ts('updated_at').notNull(),
    updatedBy: uuid('updated_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('recurring_txn_rule_budget_idx').on(t.budgetId),
    check(
      'recurring_txn_rule_label_length',
      sql`char_length(btrim(${t.label})) BETWEEN 1 AND 60`,
    ),
    check(
      'recurring_txn_rule_amount_range',
      sql`${t.amountMinor} BETWEEN 1 AND 100000000`,
    ),
    check('recurring_txn_rule_day', sql`${t.dayOfMonth} BETWEEN 1 AND 31`),
    check(
      'recurring_txn_rule_joint_card',
      sql`${t.paymentMethod} <> 'joint_card' OR ${t.payerMembershipId} IS NULL`,
    ),
    check(
      'recurring_txn_rule_member_methods',
      sql`${t.paymentMethod} NOT IN ('personal_card', 'meal_voucher') OR ${t.payerMembershipId} IS NOT NULL`,
    ),
  ],
);

export const txns = pgTable(
  'txn',
  {
    /** Client-generated UUID v7: creation is idempotent (research R3). */
    id: uuid('id').primaryKey(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    monthId: uuid('month_id')
      .notNull()
      .references(() => budgetMonths.id, { onDelete: 'restrict' }),
    date: date('date', { mode: 'string' }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    isRefund: boolean('is_refund').notNull().default(false),
    label: text('label').notNull(),
    labelNormalized: text('label_normalized').notNull(),
    /** Null = joint account. */
    payerMembershipId: uuid('payer_membership_id').references(
      () => memberships.id,
    ),
    paymentMethod: paymentMethod('payment_method').notNull(),
    isPlanned: boolean('is_planned').notNull(),
    plannedSetByHand: boolean('planned_set_by_hand').notNull().default(false),
    isShared: boolean('is_shared').notNull().default(false),
    note: text('note'),
    origin: txnOrigin('origin').notNull(),
    recurringRuleId: uuid('recurring_rule_id').references(
      () => recurringTxnRules.id,
      { onDelete: 'set null' },
    ),
    scheduledDate: date('scheduled_date', { mode: 'string' }),
    importKey: text('import_key'),
    version: integer('version').notNull().default(1),
    createdAt: ts('created_at').notNull(),
    createdBy: uuid('created_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
    updatedAt: ts('updated_at').notNull(),
    updatedBy: uuid('updated_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('txn_month_idx').on(t.monthId, t.date, t.id),
    index('txn_budget_created_idx').on(t.budgetId, t.createdAt),
    index('txn_budget_label_idx').on(t.budgetId, t.labelNormalized),
    uniqueIndex('txn_recurring_once')
      .on(t.recurringRuleId, t.scheduledDate)
      .where(sql`${t.recurringRuleId} IS NOT NULL`),
    uniqueIndex('txn_import_key_unique')
      .on(t.budgetId, t.importKey)
      .where(sql`${t.importKey} IS NOT NULL`),
    check('txn_amount_non_zero', sql`${t.amountMinor} <> 0`),
    check(
      'txn_amount_range',
      sql`${t.amountMinor} BETWEEN -100000000 AND 100000000`,
    ),
    check('txn_refund_sign', sql`(${t.amountMinor} < 0) = ${t.isRefund}`),
    check(
      'txn_label_length',
      sql`char_length(btrim(${t.label})) BETWEEN 1 AND 60`,
    ),
    check(
      'txn_note_length',
      sql`${t.note} IS NULL OR char_length(${t.note}) <= 500`,
    ),
    check(
      'txn_joint_card',
      sql`${t.paymentMethod} <> 'joint_card' OR ${t.payerMembershipId} IS NULL`,
    ),
    check(
      'txn_member_methods',
      sql`${t.paymentMethod} NOT IN ('personal_card', 'meal_voucher') OR ${t.payerMembershipId} IS NOT NULL`,
    ),
  ],
);

export const txnParts = pgTable(
  'txn_part',
  {
    id: uuid('id').primaryKey(),
    txnId: uuid('txn_id')
      .notNull()
      .references(() => txns.id, { onDelete: 'cascade' }),
    lineId: uuid('line_id').references(() => budgetLines.id, {
      onDelete: 'set null',
    }),
    subItemId: uuid('sub_item_id').references(() => envelopeSubItems.id, {
      onDelete: 'set null',
    }),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    needsReview: boolean('needs_review').notNull().default(false),
    position: integer('position').notNull(),
  },
  (t) => [
    index('txn_part_txn_idx').on(t.txnId),
    index('txn_part_line_idx').on(t.lineId),
    check('txn_part_non_zero', sql`${t.amountMinor} <> 0`),
  ],
);

export const txnReceipts = pgTable(
  'txn_receipt',
  {
    id: uuid('id').primaryKey(),
    txnId: uuid('txn_id')
      .notNull()
      .references(() => txns.id, { onDelete: 'cascade' }),
    contentType: text('content_type').notNull(),
    bytes: bytea('bytes').notNull(),
    createdAt: ts('created_at').notNull(),
    createdBy: uuid('created_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('txn_receipt_txn_idx').on(t.txnId),
    check('txn_receipt_type', sql`${t.contentType} = 'image/jpeg'`),
    check('txn_receipt_size', sql`octet_length(${t.bytes}) <= 1048576`),
  ],
);

export const settlements = pgTable(
  'settlement',
  {
    id: uuid('id').primaryKey(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    monthId: uuid('month_id')
      .notNull()
      .references(() => budgetMonths.id, { onDelete: 'cascade' }),
    fromMembershipId: uuid('from_membership_id')
      .notNull()
      .references(() => memberships.id),
    toMembershipId: uuid('to_membership_id')
      .notNull()
      .references(() => memberships.id),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    createdAt: ts('created_at').notNull(),
    createdBy: uuid('created_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('settlement_month_idx').on(t.monthId),
    check('settlement_positive', sql`${t.amountMinor} > 0`),
    check(
      'settlement_distinct',
      sql`${t.fromMembershipId} <> ${t.toMembershipId}`,
    ),
  ],
);

export const recurringSkips = pgTable(
  'recurring_skip',
  {
    ruleId: uuid('rule_id')
      .notNull()
      .references(() => recurringTxnRules.id, { onDelete: 'cascade' }),
    scheduledDate: date('scheduled_date', { mode: 'string' }).notNull(),
    reason: recurringSkipReason('reason').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.ruleId, t.scheduledDate] })],
);

export const bankCsvMappings = pgTable(
  'bank_csv_mapping',
  {
    id: uuid('id').primaryKey(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    headerFingerprint: text('header_fingerprint').notNull(),
    /** `CsvMapping` validated by the shared Zod schema. */
    mapping: jsonb('mapping').$type<Record<string, unknown>>().notNull(),
    updatedAt: ts('updated_at').notNull(),
    updatedBy: uuid('updated_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    uniqueIndex('bank_csv_mapping_unique').on(t.budgetId, t.headerFingerprint),
  ],
);

/** Counts only: no label, amount or line (FR-013, Principle III). */
export const suggestionStats = pgTable(
  'suggestion_stat',
  {
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    kept: integer('kept').notNull().default(0),
    changed: integer('changed').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.budgetId, t.membershipId, t.day] })],
);
