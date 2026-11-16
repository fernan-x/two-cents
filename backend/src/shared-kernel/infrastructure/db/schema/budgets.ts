import { sql } from 'drizzle-orm';
import {
  bigint,
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
import { sessions, users } from './identity';

// Tables for spec 002 (shared budgets). See specs/002-shared-budgets/data-model.md.

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });

const bytea = customType<{ data: Buffer }>({
  dataType: () => 'bytea',
});

export const budgets = pgTable(
  'budget',
  {
    id: uuid('id').primaryKey(),
    /** 1–60 chars after trim (FR-001). */
    name: text('name').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    timeZone: text('time_zone').notNull(),
    createdAt: ts('created_at').notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    deletedAt: ts('deleted_at'),
    deletedBy: uuid('deleted_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    index('budget_deleted_at_idx')
      .on(t.deletedAt)
      .where(sql`${t.deletedAt} IS NOT NULL`),
    check(
      'budget_name_length',
      sql`char_length(btrim(${t.name})) BETWEEN 1 AND 60`,
    ),
    check('budget_currency_iso', sql`${t.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const budgetMonthStartRules = pgTable(
  'budget_month_start_rule',
  {
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    effectiveFrom: date('effective_from', { mode: 'string' }).notNull(),
    startDay: smallint('start_day').notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.budgetId, t.effectiveFrom] }),
    check('start_day_range', sql`${t.startDay} BETWEEN 1 AND 28`),
  ],
);

export const membershipRole = pgEnum('membership_role', [
  'owner',
  'admin',
  'member',
  'viewer',
]);
export const membershipLeftReason = pgEnum('membership_left_reason', [
  'left',
  'removed',
  'account_deleted',
]);

export const memberships = pgTable(
  'membership',
  {
    id: uuid('id').primaryKey(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    /** Null once the account is permanently deleted ("Ancien membre", R14-C3). */
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    displayNameSnapshot: text('display_name_snapshot'),
    role: membershipRole('role').notNull(),
    joinedAt: ts('joined_at').notNull(),
    leftAt: ts('left_at'),
    leftReason: membershipLeftReason('left_reason'),
    lastOpenedAt: ts('last_opened_at'),
  },
  (t) => [
    uniqueIndex('membership_one_owner')
      .on(t.budgetId)
      .where(sql`${t.role} = 'owner' AND ${t.leftAt} IS NULL`),
    uniqueIndex('membership_one_current_per_user')
      .on(t.budgetId, t.userId)
      .where(sql`${t.leftAt} IS NULL`),
    index('membership_user_idx').on(t.userId),
    check(
      'membership_owner_is_current',
      sql`${t.role} <> 'owner' OR ${t.leftAt} IS NULL`,
    ),
  ],
);

export const memberIncomes = pgTable(
  'member_income',
  {
    membershipId: uuid('membership_id')
      .notNull()
      .references(() => memberships.id, { onDelete: 'cascade' }),
    monthStart: date('month_start', { mode: 'string' }).notNull(),
    amountMinor: bigint('amount_minor', { mode: 'bigint' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    updatedAt: ts('updated_at').notNull(),
    updatedBy: uuid('updated_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    primaryKey({ columns: [t.membershipId, t.monthStart] }),
    check('member_income_non_negative', sql`${t.amountMinor} >= 0`),
  ],
);

export const invitationKind = pgEnum('invitation_kind', ['email', 'code']);
export const invitationRole = pgEnum('invitation_role', [
  'admin',
  'member',
  'viewer',
]);
export const invitationStatus = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'declined',
  'revoked',
  'expired',
]);

export const invitations = pgTable(
  'invitation',
  {
    id: uuid('id').primaryKey(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    kind: invitationKind('kind').notNull(),
    emailNormalized: text('email_normalized'),
    role: invitationRole('role').notNull().default('member'),
    /** HMAC-SHA256 of the 6-character code (R6). */
    codeHash: bytea('code_hash').notNull(),
    invitedBy: uuid('invited_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    inviterNameSnapshot: text('inviter_name_snapshot').notNull(),
    status: invitationStatus('status').notNull().default('pending'),
    lastSentAt: ts('last_sent_at').notNull(),
    expiresAt: ts('expires_at').notNull(),
    sendCount: integer('send_count').notNull().default(1),
    resolvedAt: ts('resolved_at'),
    resolvedBy: uuid('resolved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => [
    uniqueIndex('invitation_one_pending_email')
      .on(t.budgetId, t.emailNormalized)
      .where(sql`${t.status} = 'pending' AND ${t.kind} = 'email'`),
    uniqueIndex('invitation_pending_code')
      .on(t.codeHash)
      .where(sql`${t.status} = 'pending'`),
    index('invitation_budget_idx').on(t.budgetId),
    index('invitation_invited_by_idx').on(t.invitedBy),
    check(
      'invitation_email_required',
      sql`${t.kind} = 'code' OR ${t.emailNormalized} IS NOT NULL`,
    ),
  ],
);

export const membershipEventType = pgEnum('membership_event_type', [
  'budget_created',
  'joined',
  'role_changed',
  'ownership_transferred',
  'removed',
  'left',
  'invitation_sent',
  'invitation_revoked',
  'settings_changed',
  'budget_deleted',
  'budget_restored',
]);

export const membershipEvents = pgTable(
  'membership_event',
  {
    id: uuid('id').primaryKey(),
    budgetId: uuid('budget_id')
      .notNull()
      .references(() => budgets.id, { onDelete: 'cascade' }),
    type: membershipEventType('type').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    targetMembershipId: uuid('target_membership_id').references(
      () => memberships.id,
      { onDelete: 'set null' },
    ),
    /** Non-sensitive only: no amounts, no emails (Principle III). */
    details: jsonb('details').$type<Record<string, unknown>>().notNull(),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('membership_event_budget_idx').on(t.budgetId, t.id)],
);

export const pushPlatform = pgEnum('push_platform', ['ios', 'android']);

export const pushDevices = pgTable(
  'push_device',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    /** The token dies with its session (R8). */
    sessionId: uuid('session_id')
      .notNull()
      .unique()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    expoPushToken: text('expo_push_token').notNull().unique(),
    platform: pushPlatform('platform').notNull(),
    updatedAt: ts('updated_at').notNull(),
  },
  (t) => [index('push_device_user_idx').on(t.userId)],
);

export const inviteCodeFailures = pgTable(
  'invite_code_failure',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    failedAt: ts('failed_at').notNull(),
  },
  (t) => [index('invite_code_failure_user_idx').on(t.userId, t.failedAt)],
);
