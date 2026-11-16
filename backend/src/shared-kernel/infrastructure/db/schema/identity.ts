import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  type AnyPgColumn,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

// Tables for spec 001 (identity). See specs/001-user-accounts/data-model.md.

const ts = (name: string) =>
  timestamp(name, { withTimezone: true, mode: 'date' });

export const userStatus = pgEnum('user_status', ['active', 'pending_deletion']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull(),
  emailNormalized: text('email_normalized').notNull().unique(),
  emailConfirmedAt: ts('email_confirmed_at'),
  emailDeliverable: boolean('email_deliverable').notNull().default(true),
  firstName: text('first_name').notNull(),
  avatarKey: text('avatar_key').notNull(),
  colorKey: text('color_key').notNull(),
  locale: text('locale').notNull(),
  currency: char('currency', { length: 3 }).notNull().default('EUR'),
  passwordHash: text('password_hash'),
  failedLoginCount: integer('failed_login_count').notNull().default(0),
  lockedUntil: ts('locked_until'),
  status: userStatus('status').notNull().default('active'),
  deletionRequestedAt: ts('deletion_requested_at'),
  deletionScheduledAt: ts('deletion_scheduled_at'),
  createdAt: ts('created_at').notNull(),
  updatedAt: ts('updated_at').notNull(),
});

export const authMethod = pgEnum('auth_method', [
  'password',
  'apple',
  'google',
]);
export const devicePlatform = pgEnum('device_platform', [
  'ios',
  'android',
  'web',
]);
export const sessionRevokedReason = pgEnum('session_revoked_reason', [
  'logout',
  'revoked_by_user',
  'password_changed',
  'reuse_detected',
  'provider_revoked',
  'account_deletion',
]);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    authMethod: authMethod('auth_method').notNull(),
    refreshTokenHash: text('refresh_token_hash').notNull().unique(),
    previousRefreshTokenHash: text('previous_refresh_token_hash'),
    deviceName: text('device_name').notNull(),
    devicePlatform: devicePlatform('device_platform').notNull(),
    createdAt: ts('created_at').notNull(),
    lastUsedAt: ts('last_used_at').notNull(),
    reauthTokenHash: text('reauth_token_hash'),
    reauthExpiresAt: ts('reauth_expires_at'),
    revokedAt: ts('revoked_at'),
    revokedReason: sessionRevokedReason('revoked_reason'),
  },
  (t) => [
    index('sessions_active_user_idx')
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
    index('sessions_previous_refresh_idx').on(t.previousRefreshTokenHash),
  ],
);

export const emailTokenPurpose = pgEnum('email_token_purpose', [
  'confirm_email',
  'reset_password',
  'link_account',
  'cancel_deletion',
]);

export const emailTokens = pgTable(
  'email_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: emailTokenPurpose('purpose').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    pendingLinkId: uuid('pending_link_id').references(
      (): AnyPgColumn => pendingLinks.id,
      { onDelete: 'cascade' },
    ),
    expiresAt: ts('expires_at').notNull(),
    usedAt: ts('used_at'),
    supersededAt: ts('superseded_at'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('email_tokens_user_purpose_idx').on(t.userId, t.purpose)],
);

export const securityEventType = pgEnum('security_event_type', [
  'signup',
  'login_succeeded',
  'login_failed',
  'account_locked',
  'password_reset_requested',
  'password_reset',
  'email_confirmed',
  'session_revoked',
  'identity_linked',
  'deletion_requested',
  'deletion_cancelled',
  'account_deleted',
  'breach_check_unavailable',
  'email_delivery_failed',
]);

export const securityEvents = pgTable(
  'security_events',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    sessionId: uuid('session_id'),
    type: securityEventType('type').notNull(),
    ipHash: text('ip_hash'),
    userAgentFamily: text('user_agent_family'),
    createdAt: ts('created_at').notNull(),
  },
  (t) => [index('security_events_user_idx').on(t.userId)],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

export const identityProvider = pgEnum('identity_provider', [
  'apple',
  'google',
]);

export const authIdentities = pgTable(
  'auth_identities',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: identityProvider('provider').notNull(),
    providerSubject: text('provider_subject').notNull(),
    providerEmail: text('provider_email'),
    isPrivateRelay: boolean('is_private_relay').notNull().default(false),
    appleRefreshTokenEnc: bytea('apple_refresh_token_enc'),
    createdAt: ts('created_at').notNull(),
    lastUsedAt: ts('last_used_at').notNull(),
  },
  (t) => [
    unique('auth_identities_provider_subject_uq').on(
      t.provider,
      t.providerSubject,
    ),
    unique('auth_identities_user_provider_uq').on(t.userId, t.provider),
  ],
);

export const pendingLinks = pgTable('pending_links', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  provider: identityProvider('provider').notNull(),
  providerSubject: text('provider_subject').notNull(),
  providerEmail: text('provider_email').notNull(),
  isPrivateRelay: boolean('is_private_relay').notNull().default(false),
  appleRefreshTokenEnc: bytea('apple_refresh_token_enc'),
  linkTokenHash: text('link_token_hash').notNull().unique(),
  expiresAt: ts('expires_at').notNull(),
  completedAt: ts('completed_at'),
  createdAt: ts('created_at').notNull(),
});
