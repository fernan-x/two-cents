import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { budgets, memberships } from './budgets';

// Tables for spec 003 (monthly budget planning). See specs/003-monthly-budget-planning/data-model.md.

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });

export const monthStatus = pgEnum('month_status', [
  'draft',
  'active',
  'closed',
]);
export const monthCreatedFrom = pgEnum('month_created_from', [
  'previous',
  'month',
  'template',
  'scratch',
  'import',
  'income',
]);
export const lineGroup = pgEnum('line_group', [
  'personal',
  'recurring_shared',
  'one_off_shared',
]);
export const lineKind = pgEnum('line_kind', ['expense', 'savings']);
export const splitMode = pgEnum('split_mode', [
  'custom',
  'equal',
  'proportional',
  'one_payer',
]);
export const categorySystemKey = pgEnum('category_system_key', [
  'housing',
  'food',
  'transport',
  'pets',
  'leisure',
  'health',
  'subscriptions',
  'savings',
  'gifts',
  'other',
]);
export const changeCause = pgEnum('change_cause', [
  'user',
  'propagation',
  'recompute',
  'import',
  'system',
]);
export const changeEntity = pgEnum('change_entity', [
  'line',
  'income',
  'month',
  'order',
]);
export const changeAction = pgEnum('change_action', [
  'created',
  'updated',
  'deleted',
  'reordered',
  'activated',
  'closed',
  'reopened',
  'confirmed',
]);

export const monthTemplates = pgTable(
  'month_template',
  {
    id: uuid('id').primaryKey(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** `TemplateLine[]` validated by the shared Zod schema (research R15). */
    lines: jsonb('lines').$type<unknown[]>().notNull(),
    createdBy: uuid('created_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
    createdAt: ts('created_at').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('month_template_name_unique').on(
      t.budgetId,
      sql`lower(${t.name})`,
    ),
    check(
      'month_template_name_length',
      sql`char_length(btrim(${t.name})) BETWEEN 1 AND 60`,
    ),
  ],
);

export const budgetMonths = pgTable(
  'budget_month',
  {
    id: uuid('id').primaryKey(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    periodEnd: date('period_end', { mode: 'string' }).notNull(),
    status: monthStatus('status').notNull().default('draft'),
    /** +1 on every write to the month (research R4). */
    revision: bigint('revision', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    createdFrom: monthCreatedFrom('created_from').notNull(),
    sourceMonthId: uuid('source_month_id'),
    sourceTemplateId: uuid('source_template_id').references(
      () => monthTemplates.id,
      { onDelete: 'set null' },
    ),
    createdAt: ts('created_at').notNull(),
    createdBy: uuid('created_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
    activatedAt: ts('activated_at'),
    activatedBy: uuid('activated_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
    closedAt: ts('closed_at'),
    closedBy: uuid('closed_by').references(() => memberships.id, {
      onDelete: 'set null',
    }),
    /** Full unredacted summary frozen at close (FR-036). */
    closedSummary: jsonb('closed_summary').$type<Record<string, unknown>>(),
  },
  (t) => [
    uniqueIndex('budget_month_period_unique').on(t.budgetId, t.periodStart),
    check('budget_month_period_order', sql`${t.periodEnd} >= ${t.periodStart}`),
    check(
      'budget_month_closed_summary',
      sql`(${t.status} = 'closed') = (${t.closedSummary} IS NOT NULL)`,
    ),
  ],
);

export const budgetCategories = pgTable(
  'budget_category',
  {
    id: uuid('id').primaryKey(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    systemKey: categorySystemKey('system_key'),
    name: text('name'),
    position: integer('position').notNull(),
  },
  (t) => [
    index('budget_category_budget_idx').on(t.budgetId),
    uniqueIndex('budget_category_name_unique')
      .on(t.budgetId, sql`lower(${t.name})`)
      .where(sql`${t.name} IS NOT NULL`),
    check(
      'budget_category_named',
      sql`${t.systemKey} IS NOT NULL OR ${t.name} IS NOT NULL`,
    ),
    check(
      'budget_category_name_length',
      sql`${t.name} IS NULL OR char_length(btrim(${t.name})) BETWEEN 1 AND 40`,
    ),
  ],
);

export const budgetLines = pgTable(
  'budget_line',
  {
    id: uuid('id').primaryKey(),
    monthId: uuid('month_id')
      .notNull()
      .references(() => budgetMonths.id, { onDelete: 'cascade' }),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    seriesId: uuid('series_id').notNull(),
    group: lineGroup('group').notNull(),
    kind: lineKind('kind').notNull().default('expense'),
    label: text('label').notNull(),
    categoryId: uuid('category_id').references(() => budgetCategories.id, {
      onDelete: 'set null',
    }),
    isEnvelope: boolean('is_envelope').notNull().default(false),
    ownerMembershipId: uuid('owner_membership_id').references(
      () => memberships.id,
    ),
    isPrivate: boolean('is_private').notNull().default(false),
    splitMode: splitMode('split_mode'),
    payerMembershipId: uuid('payer_membership_id').references(
      () => memberships.id,
    ),
    totalMinor: bigint('total_minor', { mode: 'bigint' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    formula: jsonb('formula').$type<{
      kind: string;
      baseMinor: string;
      factor: number;
    }>(),
    position: integer('position').notNull(),
    version: integer('version').notNull().default(1),
    handEdited: boolean('hand_edited').notNull().default(false),
    /** "This month only": the usual amount fields (research R7). */
    usual: jsonb('usual').$type<Record<string, unknown>>(),
    needsReview: boolean('needs_review').notNull().default(false),
    needsIncome: boolean('needs_income').notNull().default(false),
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
    index('budget_line_month_idx').on(t.monthId, t.group, t.position),
    index('budget_line_series_idx').on(t.budgetId, t.seriesId),
    check(
      'budget_line_personal_owner',
      sql`(${t.group} = 'personal') = (${t.ownerMembershipId} IS NOT NULL)`,
    ),
    check(
      'budget_line_personal_split',
      sql`(${t.group} = 'personal') = (${t.splitMode} IS NULL)`,
    ),
    check(
      'budget_line_private_personal',
      sql`NOT ${t.isPrivate} OR ${t.group} = 'personal'`,
    ),
    check(
      'budget_line_one_payer',
      sql`(${t.splitMode} IS NOT DISTINCT FROM 'one_payer') = (${t.payerMembershipId} IS NOT NULL)`,
    ),
    check(
      'budget_line_label_length',
      sql`char_length(btrim(${t.label})) BETWEEN 1 AND 60`,
    ),
    check(
      'budget_line_total_range',
      sql`${t.totalMinor} BETWEEN 0 AND 100000000`,
    ),
  ],
);

export const budgetLineShares = pgTable(
  'budget_line_share',
  {
    lineId: uuid('line_id')
      .notNull()
      .references(() => budgetLines.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.lineId, t.membershipId] }),
    check('budget_line_share_non_negative', sql`${t.amountMinor} >= 0`),
  ],
);

export const envelopeSubItems = pgTable(
  'envelope_sub_item',
  {
    id: uuid('id').primaryKey(),
    lineId: uuid('line_id')
      .notNull()
      .references(() => budgetLines.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }),
    position: integer('position').notNull(),
  },
  (t) => [
    index('envelope_sub_item_line_idx').on(t.lineId),
    check(
      'envelope_sub_item_label_length',
      sql`char_length(btrim(${t.label})) BETWEEN 1 AND 40`,
    ),
    check(
      'envelope_sub_item_non_negative',
      sql`${t.amountMinor} IS NULL OR ${t.amountMinor} >= 0`,
    ),
  ],
);

export const incomeLines = pgTable(
  'income_line',
  {
    id: uuid('id').primaryKey(),
    monthId: uuid('month_id')
      .notNull()
      .references(() => budgetMonths.id, { onDelete: 'cascade' }),
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id, { onDelete: 'cascade' }),
    /** Null = the default "Revenu" label. */
    label: text('label'),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    countsTowardHousehold: boolean('counts_toward_household')
      .notNull()
      .default(true),
    toConfirm: boolean('to_confirm').notNull().default(false),
    isPrimary: boolean('is_primary').notNull().default(false),
    position: integer('position').notNull(),
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
    index('income_line_month_idx').on(t.monthId),
    uniqueIndex('income_line_one_primary')
      .on(t.monthId, t.membershipId)
      .where(sql`${t.isPrimary}`),
    check(
      'income_line_amount_range',
      sql`${t.amountMinor} BETWEEN 0 AND 100000000`,
    ),
    check(
      'income_line_label_length',
      sql`${t.label} IS NULL OR char_length(btrim(${t.label})) BETWEEN 1 AND 40`,
    ),
  ],
);

export const monthChanges = pgTable(
  'month_change',
  {
    id: uuid('id').primaryKey(),
    monthId: uuid('month_id')
      .notNull()
      .references(() => budgetMonths.id, { onDelete: 'cascade' }),
    actorMembershipId: uuid('actor_membership_id').references(
      () => memberships.id,
      { onDelete: 'set null' },
    ),
    cause: changeCause('cause').notNull(),
    entity: changeEntity('entity').notNull(),
    entityId: uuid('entity_id'),
    action: changeAction('action').notNull(),
    isPrivate: boolean('is_private').notNull().default(false),
    ownerMembershipId: uuid('owner_membership_id'),
    labelSnapshot: text('label_snapshot'),
    /** `[{ field, old, new }]`, amounts as integer strings. */
    changes: jsonb('changes')
      .$type<Array<{ field: string; old: string | null; new: string | null }>>()
      .notNull(),
    monthStatus: monthStatus('month_status').notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('month_change_month_idx').on(t.monthId, t.id)],
);
