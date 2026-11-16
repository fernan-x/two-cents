import type { AvatarKey, ColorKey, Locale } from '@two-cents/shared/contracts';

/** What the budgets context reads about people (owned by spec 001). */
export interface UserInfo {
  id: string;
  firstName: string;
  emailNormalized: string;
  emailConfirmed: boolean;
  avatarKey: AvatarKey;
  colorKey: ColorKey;
  locale: Locale;
}

export interface UserDirectory {
  findByIds(ids: readonly string[]): Promise<Map<string, UserInfo>>;
  findByEmail(emailNormalized: string): Promise<UserInfo | null>;
}
export const USER_DIRECTORY = Symbol('UserDirectory');

/** Invitation codes (research R6): generated at random, stored only as an HMAC. */
export interface InviteCodes {
  /** A new 6-character code. */
  generate(): string;
  /** Hex HMAC of a normalized code. */
  hash(code: string): string;
}
export const INVITE_CODES = Symbol('InviteCodes');

/** Public links (contracts/links-and-notifications.md). */
export interface InvitationLinks {
  /** `https://<app-domain>/i/<CODE>`. */
  forCode(code: string): string;
}
export const INVITATION_LINKS = Symbol('InvitationLinks');
