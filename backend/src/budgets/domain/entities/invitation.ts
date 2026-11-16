import type { ErrorCode } from '@two-cents/shared/contracts';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { AssignableRole } from './membership';

/** Every invitation expires 7 days after it was last sent (FR-012). */
export const INVITATION_TTL_MS = 7 * 86_400_000;

export type InvitationKind = 'email' | 'code';
export type InvitationStatus =
  'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';

export interface InvitationProps {
  id: string;
  budgetId: string;
  kind: InvitationKind;
  emailNormalized: string | null;
  role: AssignableRole;
  /** Hex HMAC of the code (R6); the code itself is never stored. */
  codeHash: string;
  invitedBy: string | null;
  inviterNameSnapshot: string;
  status: InvitationStatus;
  lastSentAt: Date;
  expiresAt: Date;
  sendCount: number;
  resolvedAt: Date | null;
  resolvedBy: string | null;
}

const GONE: Record<Exclude<InvitationStatus, 'pending'>, ErrorCode> = {
  expired: 'INVITATION_EXPIRED',
  revoked: 'INVITATION_REVOKED',
  declined: 'INVITATION_DECLINED',
  accepted: 'INVITATION_USED',
};

/** An offer to join a budget, by email or by code (FR-008 to FR-023). */
export class Invitation {
  private constructor(private props: InvitationProps) {}

  static create(input: {
    id: string;
    budgetId: string;
    kind: InvitationKind;
    emailNormalized: string | null;
    role: AssignableRole;
    codeHash: string;
    invitedBy: string;
    inviterName: string;
    now: Date;
  }): Invitation {
    if (input.kind === 'email' && !input.emailNormalized)
      throw new DomainError('VALIDATION_FAILED');
    return new Invitation({
      id: input.id,
      budgetId: input.budgetId,
      kind: input.kind,
      emailNormalized: input.kind === 'email' ? input.emailNormalized : null,
      role: input.role,
      codeHash: input.codeHash,
      invitedBy: input.invitedBy,
      inviterNameSnapshot: input.inviterName,
      status: 'pending',
      lastSentAt: input.now,
      expiresAt: new Date(input.now.getTime() + INVITATION_TTL_MS),
      sendCount: 1,
      resolvedAt: null,
      resolvedBy: null,
    });
  }

  static fromPersistence(props: InvitationProps): Invitation {
    return new Invitation({ ...props });
  }

  toPersistence(): InvitationProps {
    return { ...this.props };
  }

  get id() {
    return this.props.id;
  }
  get budgetId() {
    return this.props.budgetId;
  }
  get kind() {
    return this.props.kind;
  }
  get emailNormalized() {
    return this.props.emailNormalized;
  }
  get role() {
    return this.props.role;
  }
  get codeHash() {
    return this.props.codeHash;
  }
  get invitedBy() {
    return this.props.invitedBy;
  }
  get inviterName() {
    return this.props.inviterNameSnapshot;
  }
  get lastSentAt() {
    return this.props.lastSentAt;
  }
  get expiresAt() {
    return this.props.expiresAt;
  }
  get sendCount() {
    return this.props.sendCount;
  }

  /** Pending and not past its expiry: the only usable state. */
  isEffectivelyPending(now: Date): boolean {
    return (
      this.props.status === 'pending' &&
      this.props.expiresAt.getTime() > now.getTime()
    );
  }

  /** The status as people see it: a pending invitation past its expiry is expired. */
  status(now: Date): InvitationStatus {
    return this.props.status === 'pending' && !this.isEffectivelyPending(now)
      ? 'expired'
      : this.props.status;
  }

  /** The specific error for an invitation that can no longer be used (FR-021), or null. */
  goneReason(now: Date): ErrorCode | null {
    const status = this.status(now);
    return status === 'pending' ? null : GONE[status];
  }

  /** Throws the specific error when the invitation can't be used any more. */
  assertUsable(now: Date): void {
    const reason = this.goneReason(now);
    if (reason)
      throw new DomainError(reason, { inviterName: this.inviterName });
  }

  /** FR-014 and US4: sent again with a fresh 7-day expiry; a code invitation gets a new code. */
  resend(now: Date, newCodeHash?: string): void {
    if (!this.isEffectivelyPending(now)) throw new DomainError('STALE_STATE');
    this.props.lastSentAt = now;
    this.props.expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);
    this.props.sendCount += 1;
    if (newCodeHash) this.props.codeHash = newCodeHash;
  }

  accept(userId: string, now: Date): void {
    this.assertUsable(now);
    this.resolve('accepted', userId, now);
  }

  decline(userId: string, now: Date): void {
    this.assertUsable(now);
    this.resolve('declined', userId, now);
  }

  revoke(userId: string | null, now: Date): void {
    if (!this.isEffectivelyPending(now)) throw new DomainError('STALE_STATE');
    this.resolve('revoked', userId, now);
  }

  private resolve(
    status: InvitationStatus,
    userId: string | null,
    now: Date,
  ): void {
    this.props.status = status;
    this.props.resolvedAt = now;
    this.props.resolvedBy = userId;
  }
}
