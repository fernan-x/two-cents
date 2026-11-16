import type { AuthIdentity, IdentityProvider } from '../entities/auth-identity';
import type { EmailToken, EmailTokenPurpose } from '../entities/email-token';
import type { Session, SessionRevokedReason } from '../entities/session';
import type { PendingLink } from '../entities/pending-link';
import type { User } from '../entities/user';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByNormalizedEmail(emailNormalized: string): Promise<User | null>;
  /** Inserts or updates. */
  save(user: User): Promise<void>;
  delete(id: string): Promise<void>;
  /** Accounts whose grace period is over (FR-042). */
  findDueForDeletion(now: Date, limit: number): Promise<User[]>;
}
export const USER_REPOSITORY = Symbol('UserRepository');

export interface SessionRepository {
  findById(id: string): Promise<Session | null>;
  findByRefreshHash(hash: string): Promise<Session | null>;
  findByPreviousRefreshHash(hash: string): Promise<Session | null>;
  listActiveByUser(userId: string, now: Date): Promise<Session[]>;
  save(session: Session): Promise<void>;
  /** Revokes every active session of the user, except one when given. Returns the number revoked. */
  revokeAllForUser(
    userId: string,
    reason: SessionRevokedReason,
    now: Date,
    exceptSessionId?: string,
  ): Promise<number>;
}
export const SESSION_REPOSITORY = Symbol('SessionRepository');

export interface EmailTokenRepository {
  findByHash(hash: string): Promise<EmailToken | null>;
  save(token: EmailToken): Promise<void>;
  /** Marks every still-valid token of this purpose for the user as superseded. */
  supersedeAll(
    userId: string,
    purpose: EmailTokenPurpose,
    now: Date,
  ): Promise<void>;
}
export const EMAIL_TOKEN_REPOSITORY = Symbol('EmailTokenRepository');

export type SecurityEventType =
  | 'signup'
  | 'login_succeeded'
  | 'login_failed'
  | 'account_locked'
  | 'password_reset_requested'
  | 'password_reset'
  | 'email_confirmed'
  | 'session_revoked'
  | 'identity_linked'
  | 'deletion_requested'
  | 'deletion_cancelled'
  | 'account_deleted'
  | 'breach_check_unavailable'
  | 'email_delivery_failed';

/** Audit trail without personal data (FR-052): no emails, tokens, passwords or amounts. */
export interface SecurityEventLog {
  record(event: {
    type: SecurityEventType;
    userId?: string | null;
    sessionId?: string | null;
  }): Promise<void>;
}
export const SECURITY_EVENT_LOG = Symbol('SecurityEventLog');

export interface AuthIdentityRepository {
  findByProviderSubject(
    provider: IdentityProvider,
    subject: string,
  ): Promise<AuthIdentity | null>;
  listByUser(userId: string): Promise<AuthIdentity[]>;
  save(identity: AuthIdentity): Promise<void>;
  delete(id: string): Promise<void>;
}
export const AUTH_IDENTITY_REPOSITORY = Symbol('AuthIdentityRepository');

export interface PendingLinkRepository {
  findById(id: string): Promise<PendingLink | null>;
  findByTokenHash(hash: string): Promise<PendingLink | null>;
  save(link: PendingLink): Promise<void>;
}
export const PENDING_LINK_REPOSITORY = Symbol('PendingLinkRepository');
