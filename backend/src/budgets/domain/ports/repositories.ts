import type { LocalDate } from '@two-cents/shared/domain';
import type { Budget } from '../entities/budget';
import type { Invitation } from '../entities/invitation';
import type { MemberIncome } from '../entities/member-income';
import type { Membership } from '../entities/membership';

export interface BudgetRepository {
  /** Includes deleted budgets. */
  findById(id: string): Promise<Budget | null>;
  /**
   * Locks the budget row for the rest of the current transaction (`SELECT … FOR UPDATE`, R11):
   * every membership or invitation mutation goes through this first.
   */
  findByIdForUpdate(id: string): Promise<Budget | null>;
  findByIds(ids: readonly string[]): Promise<Budget[]>;
  /** Inserts or updates, including the start-day rules. */
  save(budget: Budget): Promise<void>;
  /** Deleted budgets `userId` deleted, still restorable at `now`. */
  listRestorableBy(userId: string, deletedAfter: Date): Promise<Budget[]>;
  /** Ids of budgets deleted before `cutoff` (FR-038b). */
  listDeletedBefore(cutoff: Date, limit: number): Promise<string[]>;
  /** Hard delete with cascades. */
  purge(id: string): Promise<void>;
}
export const BUDGET_REPOSITORY = Symbol('BudgetRepository');

export interface MembershipRepository {
  findById(id: string): Promise<Membership | null>;
  /** The user's current membership in the budget, whatever the budget's state. */
  findCurrent(budgetId: string, userId: string): Promise<Membership | null>;
  /** Every membership of the budget, current and former, oldest first. */
  listByBudget(budgetId: string): Promise<Membership[]>;
  /** The user's current memberships. */
  listCurrentByUser(userId: string): Promise<Membership[]>;
  /** Every membership the user ever had (account deletion, export). */
  listAllByUser(userId: string): Promise<Membership[]>;
  countCurrent(budgetId: string): Promise<number>;
  /** Inserts or updates. */
  save(membership: Membership): Promise<void>;
}
export const MEMBERSHIP_REPOSITORY = Symbol('MembershipRepository');

export interface InvitationRepository {
  findById(id: string): Promise<Invitation | null>;
  /** The most recent invitation whose code hashes to `codeHash`, any status. */
  findByCodeHash(codeHash: string): Promise<Invitation | null>;
  findPendingByEmail(
    budgetId: string,
    emailNormalized: string,
  ): Promise<Invitation | null>;
  listByBudget(budgetId: string): Promise<Invitation[]>;
  /** `status='pending' AND expires_at > now` (FR-023). */
  countEffectivelyPending(budgetId: string, now: Date): Promise<number>;
  /** Inserts or updates. */
  save(invitation: Invitation): Promise<void>;
  /**
   * `UPDATE … SET status='accepted' WHERE id = $1 AND status = 'pending' AND expires_at > now`:
   * false when another acceptance won (edge case "two acceptances at once").
   */
  acceptIfPending(id: string, userId: string, now: Date): Promise<boolean>;
  /** Revokes every pending invitation of the budget (FR-038c). Returns how many. */
  revokeAllPending(
    budgetId: string,
    by: string | null,
    now: Date,
  ): Promise<number>;
  /** Revokes every pending invitation sent by the user (account deletion). */
  revokeAllSentBy(userId: string, now: Date): Promise<number>;
  /** Marks pending invitations past their expiry as expired. Returns how many. */
  expireDue(now: Date): Promise<number>;
}
export const INVITATION_REPOSITORY = Symbol('InvitationRepository');

/** Read side of a member's monthly counted income; writes go through the planning module (003 R13). */
export interface IncomeRepository {
  find(
    membershipId: string,
    monthStart: LocalDate,
  ): Promise<MemberIncome | null>;
  /** Incomes of these memberships for one month, by membership id. */
  listForMonth(
    membershipIds: readonly string[],
    monthStart: LocalDate,
  ): Promise<Map<string, MemberIncome>>;
  /** Every income of these memberships (export). */
  listByMemberships(membershipIds: readonly string[]): Promise<MemberIncome[]>;
  /** Whether the budget holds any amount (FR-006). */
  existsForBudget(budgetId: string): Promise<boolean>;
}
export const INCOME_REPOSITORY = Symbol('IncomeRepository');

export type MembershipEventType =
  | 'budget_created'
  | 'joined'
  | 'role_changed'
  | 'ownership_transferred'
  | 'removed'
  | 'left'
  | 'invitation_sent'
  | 'invitation_revoked'
  | 'settings_changed'
  | 'budget_deleted'
  | 'budget_restored';

export interface MembershipEventRecord {
  id: string;
  budgetId: string;
  type: MembershipEventType;
  actorUserId: string | null;
  targetMembershipId: string | null;
  /** Non-sensitive only: roles, setting names. Never amounts or emails (Principle III). */
  details: Record<string, string | string[]>;
  createdAt: Date;
}

export interface MembershipEventLog {
  append(event: MembershipEventRecord): Promise<void>;
  /** Newest first; `before` is the id of the last event of the previous page. */
  list(
    budgetId: string,
    options: { before?: string; limit: number },
  ): Promise<MembershipEventRecord[]>;
}
export const MEMBERSHIP_EVENT_LOG = Symbol('MembershipEventLog');

export interface PushDevice {
  id: string;
  userId: string;
  sessionId: string;
  expoPushToken: string;
  platform: 'ios' | 'android';
  updatedAt: Date;
}

export interface PushDeviceRepository {
  /** One device per session; a token moves to the latest session that registers it. */
  upsertForSession(device: PushDevice): Promise<void>;
  deleteForSession(sessionId: string): Promise<void>;
  /** Tokens of the users' signed-in sessions. */
  tokensForUsers(userIds: readonly string[]): Promise<string[]>;
}
export const PUSH_DEVICE_REPOSITORY = Symbol('PushDeviceRepository');

export interface InviteCodeFailureLog {
  record(id: string, userId: string, at: Date): Promise<void>;
  /** Failure times since `since`, newest first. */
  listSince(userId: string, since: Date): Promise<Date[]>;
  deleteBefore(cutoff: Date): Promise<number>;
}
export const INVITE_CODE_FAILURE_LOG = Symbol('InviteCodeFailureLog');
