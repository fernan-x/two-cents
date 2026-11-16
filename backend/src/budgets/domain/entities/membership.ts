import {
  canManageTarget,
  localDateIn,
  type MonthMembership,
  type Role,
} from '@two-cents/shared/domain';
import { DomainError } from '../../../shared-kernel/domain/domain-error';

export type LeftReason = 'left' | 'removed' | 'account_deleted';
export type AssignableRole = Exclude<Role, 'owner'>;

export interface MembershipProps {
  id: string;
  budgetId: string;
  /** Null once the account is permanently deleted. */
  userId: string | null;
  /** First name kept for history after leaving (FR-032); null for a deleted account. */
  displayNameSnapshot: string | null;
  role: Role;
  joinedAt: Date;
  leftAt: Date | null;
  leftReason: LeftReason | null;
  lastOpenedAt: Date | null;
}

/** A person's place in a budget. Ended memberships stay for history (FR-032). */
export class Membership {
  private constructor(private props: MembershipProps) {}

  static join(input: {
    id: string;
    budgetId: string;
    userId: string;
    role: Role;
    now: Date;
  }): Membership {
    return new Membership({
      id: input.id,
      budgetId: input.budgetId,
      userId: input.userId,
      displayNameSnapshot: null,
      role: input.role,
      joinedAt: input.now,
      leftAt: null,
      leftReason: null,
      lastOpenedAt: input.now,
    });
  }

  static fromPersistence(props: MembershipProps): Membership {
    return new Membership({ ...props });
  }

  toPersistence(): MembershipProps {
    return { ...this.props };
  }

  get id() {
    return this.props.id;
  }
  get budgetId() {
    return this.props.budgetId;
  }
  get userId() {
    return this.props.userId;
  }
  get role() {
    return this.props.role;
  }
  get joinedAt() {
    return this.props.joinedAt;
  }
  get leftAt() {
    return this.props.leftAt;
  }
  get leftReason() {
    return this.props.leftReason;
  }
  get lastOpenedAt() {
    return this.props.lastOpenedAt;
  }
  get displayNameSnapshot() {
    return this.props.displayNameSnapshot;
  }
  get isCurrent() {
    return this.props.leftAt === null;
  }
  get isOwner() {
    return this.isCurrent && this.props.role === 'owner';
  }

  /** The person as seen by the month rules (FR-033), with dates in the budget's time zone. */
  forMonth(timeZone: string): MonthMembership {
    return {
      role: this.props.role,
      joinedOn: localDateIn(this.props.joinedAt, timeZone),
      leftOn: this.props.leftAt
        ? localDateIn(this.props.leftAt, timeZone)
        : null,
    };
  }

  open(now: Date): void {
    this.props.lastOpenedAt = now;
  }

  /** FR-027: the owner and Admins change any non-owner's role; never to owner (that's a transfer). */
  changeRole(actorRole: Role, newRole: AssignableRole): void {
    this.assertManageableBy(actorRole);
    this.props.role = newRole;
  }

  /** FR-029: removal by the owner or an Admin, never of the owner. */
  removeBy(actorRole: Role, displayName: string, now: Date): void {
    this.assertManageableBy(actorRole);
    this.end('removed', displayName, now);
  }

  /** FR-030: anyone but the owner may leave. */
  leave(displayName: string, now: Date): void {
    this.assertCurrent();
    if (this.props.role === 'owner')
      throw new DomainError('OWNER_MUST_TRANSFER');
    this.end('left', displayName, now);
  }

  /** FR-028: the previous owner becomes an Admin; the target becomes owner. */
  static transferOwnership(from: Membership, to: Membership): void {
    from.assertCurrent();
    to.assertCurrent();
    if (from.role !== 'owner') throw new DomainError('FORBIDDEN');
    if (to.id === from.id) throw new DomainError('STALE_STATE');
    from.props.role = 'admin';
    to.props.role = 'owner';
  }

  /** Becomes owner without a previous owner (account deletion hand-off, R14-C2). */
  promoteToOwner(): void {
    this.assertCurrent();
    this.props.role = 'owner';
  }

  /**
   * The account is being deleted: the membership ends and the name is erased, so history shows
   * an anonymous "Ancien membre" (R14-C3).
   */
  endForAccountDeletion(now: Date): void {
    if (this.isCurrent) {
      if (this.props.role === 'owner') this.props.role = 'admin';
      this.props.leftAt = now;
      this.props.leftReason = 'account_deleted';
    }
    this.props.displayNameSnapshot = null;
  }

  private end(reason: LeftReason, displayName: string, now: Date): void {
    this.props.leftAt = now;
    this.props.leftReason = reason;
    this.props.displayNameSnapshot = displayName;
  }

  private assertCurrent(): void {
    if (!this.isCurrent) throw new DomainError('STALE_STATE');
  }

  private assertManageableBy(actorRole: Role): void {
    this.assertCurrent();
    if (this.props.role === 'owner')
      throw new DomainError('CANNOT_MODIFY_OWNER');
    if (!canManageTarget(actorRole, this.props.role))
      throw new DomainError('FORBIDDEN');
  }
}
