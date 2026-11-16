import type { Locale } from '../../domain/value-objects/locale';

export interface MailRecipient {
  userId: string;
  email: string;
  locale: Locale;
  firstName: string;
}

export type IdentityMail =
  | { kind: 'confirm_email'; link: string }
  | { kind: 'reset_password'; link: string }
  | { kind: 'password_changed'; at: Date }
  | { kind: 'link_account'; link: string; provider: 'apple' | 'google' }
  | { kind: 'account_locked'; until: Date }
  | { kind: 'deletion_scheduled'; link: string; scheduledAt: Date }
  | { kind: 'account_deleted' };

/**
 * Sends identity emails. Implementations send after the current transaction commits and never throw:
 * a delivery failure is recorded as a security event (research R14).
 */
export interface IdentityMailer {
  send(to: MailRecipient, mail: IdentityMail): void;
}
export const IDENTITY_MAILER = Symbol('IdentityMailer');

export interface LinkBuilder {
  /** `${APP_LINK_BASE_URL}/l/<path>?t=<token>` (contracts/deep-links.md). */
  build(
    path: 'confirm' | 'reset' | 'link' | 'cancel-deletion',
    token: string,
  ): string;
}
export const LINK_BUILDER = Symbol('LinkBuilder');
