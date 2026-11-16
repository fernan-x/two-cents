import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { IdentityProvider } from './auth-identity';

export const PENDING_LINK_TTL_MS = 15 * 60 * 1000;

export interface PendingLinkProps {
  id: string;
  userId: string;
  provider: IdentityProvider;
  providerSubject: string;
  providerEmail: string;
  isPrivateRelay: boolean;
  appleRefreshTokenEnc: Buffer | null;
  linkTokenHash: string;
  expiresAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

/** A verified provider identity waiting for proof of ownership of the matching account (FR-007, research R10). */
export class PendingLink {
  private constructor(private props: PendingLinkProps) {}

  static create(
    input: Omit<PendingLinkProps, 'expiresAt' | 'completedAt' | 'createdAt'> & {
      now: Date;
    },
  ): PendingLink {
    const { now, ...rest } = input;
    return new PendingLink({
      ...rest,
      expiresAt: new Date(now.getTime() + PENDING_LINK_TTL_MS),
      completedAt: null,
      createdAt: now,
    });
  }

  static fromPersistence(props: PendingLinkProps): PendingLink {
    return new PendingLink({ ...props });
  }

  toSnapshot(): Readonly<PendingLinkProps> {
    return { ...this.props };
  }

  get id(): string {
    return this.props.id;
  }
  get userId(): string {
    return this.props.userId;
  }

  isExpired(now: Date): boolean {
    return this.props.expiresAt.getTime() <= now.getTime();
  }

  /** Throws LINK_EXPIRED unless still open. The emailed-link path passes `ignoreExpiry` (its own token lasts 1 h). */
  assertOpen(now: Date, ignoreExpiry = false): void {
    if (this.props.completedAt || (!ignoreExpiry && this.isExpired(now)))
      throw new DomainError('LINK_EXPIRED');
  }

  complete(now: Date): void {
    this.props.completedAt = now;
  }
}
