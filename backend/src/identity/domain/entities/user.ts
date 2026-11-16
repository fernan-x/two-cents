import {
  computeDeletionDate,
  isLockedOut,
  LOCKOUT_THRESHOLD,
  nextLockState,
} from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { Email } from '../value-objects/email';
import type { FirstName } from '../value-objects/first-name';
import type { Locale } from '../value-objects/locale';

export type UserStatus = 'active' | 'pending_deletion';

export interface UserProps {
  id: string;
  email: string;
  emailNormalized: string;
  emailConfirmedAt: Date | null;
  emailDeliverable: boolean;
  firstName: string;
  avatarKey: string;
  colorKey: string;
  locale: Locale;
  currency: string;
  passwordHash: string | null;
  failedLoginCount: number;
  lockedUntil: Date | null;
  status: UserStatus;
  deletionRequestedAt: Date | null;
  deletionScheduledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A person with an account (data-model "users"). */
export class User {
  private constructor(private props: UserProps) {}

  static register(input: {
    id: string;
    email: Email;
    firstName: FirstName;
    locale: Locale;
    passwordHash: string | null;
    emailConfirmed: boolean;
    now: Date;
  }): User {
    return new User({
      id: input.id,
      email: input.email.display,
      emailNormalized: input.email.normalized,
      emailConfirmedAt: input.emailConfirmed ? input.now : null,
      emailDeliverable: true,
      firstName: input.firstName.value,
      avatarKey: 'initials',
      colorKey: 'blue',
      locale: input.locale,
      currency: 'EUR',
      passwordHash: input.passwordHash,
      failedLoginCount: 0,
      lockedUntil: null,
      status: 'active',
      deletionRequestedAt: null,
      deletionScheduledAt: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static fromPersistence(props: UserProps): User {
    return new User({ ...props });
  }

  toSnapshot(): Readonly<UserProps> {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
  get email(): string {
    return this.props.email;
  }
  get emailNormalized(): string {
    return this.props.emailNormalized;
  }
  get emailConfirmed(): boolean {
    return this.props.emailConfirmedAt !== null;
  }
  get firstName(): string {
    return this.props.firstName;
  }
  get locale(): Locale {
    return this.props.locale;
  }
  get passwordHash(): string | null {
    return this.props.passwordHash;
  }
  get status(): UserStatus {
    return this.props.status;
  }
  get deletionScheduledAt(): Date | null {
    return this.props.deletionScheduledAt;
  }
  get emailDeliverable(): boolean {
    return this.props.emailDeliverable;
  }

  /** Throws when the account is waiting for permanent deletion (only cancel/logout are allowed then). */
  assertActive(): void {
    if (this.props.status !== 'active')
      throw new DomainError('ACCOUNT_PENDING_DELETION');
  }

  get lockedUntil(): Date | null {
    return this.props.lockedUntil;
  }

  isLockedOut(now: Date): boolean {
    return isLockedOut(this.props, now);
  }

  /** Throws ACCOUNT_LOCKED with the remaining seconds while locked (FR-005). */
  assertNotLocked(now: Date): void {
    if (!this.isLockedOut(now)) return;
    const retryAfterSeconds = Math.ceil(
      (this.props.lockedUntil!.getTime() - now.getTime()) / 1000,
    );
    throw new DomainError('ACCOUNT_LOCKED', { retryAfterSeconds });
  }

  /** Counts a wrong password; returns true when this failure locked the account. */
  recordFailedLogin(now: Date): boolean {
    const next = nextLockState(this.props.failedLoginCount, now);
    this.props.failedLoginCount = next.failedCount;
    this.props.lockedUntil = next.lockedUntil;
    this.touch(now);
    return next.failedCount === LOCKOUT_THRESHOLD;
  }

  recordSuccessfulLogin(now: Date): void {
    if (this.props.failedLoginCount === 0 && this.props.lockedUntil === null)
      return;
    this.props.failedLoginCount = 0;
    this.props.lockedUntil = null;
    this.touch(now);
  }

  /** Sets a new password hash and lifts any lockout (FR-032). */
  changePassword(hash: string, now: Date): void {
    this.props.passwordHash = hash;
    this.props.failedLoginCount = 0;
    this.props.lockedUntil = null;
    this.touch(now);
  }

  confirmEmail(now: Date): void {
    if (this.props.emailConfirmedAt) throw new DomainError('ALREADY_CONFIRMED');
    this.props.emailConfirmedAt = now;
    this.touch(now);
  }

  setEmailDeliverable(deliverable: boolean, now: Date): void {
    this.props.emailDeliverable = deliverable;
    this.touch(now);
  }

  /** FR-039. Values are already validated value objects / preset keys. */
  updateProfile(
    changes: Partial<{
      firstName: FirstName;
      avatarKey: string;
      colorKey: string;
      locale: Locale;
      currency: string;
    }>,
    now: Date,
  ): void {
    if (changes.firstName) this.props.firstName = changes.firstName.value;
    if (changes.avatarKey) this.props.avatarKey = changes.avatarKey;
    if (changes.colorKey) this.props.colorKey = changes.colorKey;
    if (changes.locale) this.props.locale = changes.locale;
    if (changes.currency) this.props.currency = changes.currency;
    this.touch(now);
  }

  /** FR-041a: starts the 7-day grace period; returns the permanent deletion date. */
  requestDeletion(now: Date): Date {
    this.assertActive();
    this.props.status = 'pending_deletion';
    this.props.deletionRequestedAt = now;
    const scheduledAt = computeDeletionDate(now);
    this.props.deletionScheduledAt = scheduledAt;
    this.touch(now);
    return scheduledAt;
  }

  /** FR-041b: restores the account exactly as before. */
  cancelDeletion(now: Date): void {
    if (this.props.status !== 'pending_deletion')
      throw new DomainError('NOT_PENDING');
    this.props.status = 'active';
    this.props.deletionRequestedAt = null;
    this.props.deletionScheduledAt = null;
    this.touch(now);
  }

  isDueForDeletion(now: Date): boolean {
    return (
      this.props.status === 'pending_deletion' &&
      this.props.deletionScheduledAt !== null &&
      this.props.deletionScheduledAt.getTime() <= now.getTime()
    );
  }

  protected touch(now: Date): void {
    this.props.updatedAt = now;
  }
}
