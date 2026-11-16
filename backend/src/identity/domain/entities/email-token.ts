import {
  emailTokenExpiry,
  type EmailTokenPurpose,
  isEmailTokenValid,
} from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

export type { EmailTokenPurpose };

export interface EmailTokenProps {
  id: string;
  userId: string;
  purpose: EmailTokenPurpose;
  tokenHash: string;
  pendingLinkId: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  supersededAt: Date | null;
  createdAt: Date;
}

/** A single-use link sent by email (data-model "email_tokens"). Only the hash is ever stored. */
export class EmailToken {
  private constructor(private props: EmailTokenProps) {}

  static issue(input: {
    id: string;
    userId: string;
    purpose: EmailTokenPurpose;
    tokenHash: string;
    now: Date;
    deletionScheduledAt?: Date;
    pendingLinkId?: string;
  }): EmailToken {
    return new EmailToken({
      id: input.id,
      userId: input.userId,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      pendingLinkId: input.pendingLinkId ?? null,
      expiresAt: emailTokenExpiry(
        input.purpose,
        input.now,
        input.deletionScheduledAt,
      ),
      usedAt: null,
      supersededAt: null,
      createdAt: input.now,
    });
  }

  static fromPersistence(props: EmailTokenProps): EmailToken {
    return new EmailToken({ ...props });
  }

  toSnapshot(): Readonly<EmailTokenProps> {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }
  get purpose(): EmailTokenPurpose {
    return this.props.purpose;
  }
  get pendingLinkId(): string | null {
    return this.props.pendingLinkId;
  }
  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  isValid(now: Date): boolean {
    return isEmailTokenValid(this.props, now);
  }

  /** Marks the token used; throws TOKEN_INVALID when expired, used or superseded (FR-031). */
  consume(purpose: EmailTokenPurpose, now: Date): void {
    if (this.props.purpose !== purpose || !this.isValid(now))
      throw new DomainError('TOKEN_INVALID');
    this.props.usedAt = now;
  }

  supersede(now: Date): void {
    if (!this.props.usedAt && !this.props.supersededAt)
      this.props.supersededAt = now;
  }
}
