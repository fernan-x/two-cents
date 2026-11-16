import { Inject, Injectable } from '@nestjs/common';
import type {
  AcceptInvitationResponse,
  InvitationPreview,
} from '@two-cents/shared/contracts';
import { normalizeInviteCode } from '@two-cents/shared/domain';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import { maskEmail } from '../../../identity/application/services/mask-email';
import type { Budget } from '../../domain/entities/budget';
import type { Invitation } from '../../domain/entities/invitation';
import { Membership } from '../../domain/entities/membership';
import {
  BUDGET_REPOSITORY,
  type BudgetRepository,
  INVITATION_REPOSITORY,
  type InvitationRepository,
  INVITE_CODE_FAILURE_LOG,
  type InviteCodeFailureLog,
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../domain/ports/repositories';
import {
  INVITE_CODES,
  type InviteCodes,
  USER_DIRECTORY,
  type UserDirectory,
} from '../ports';
import { MembershipEvents } from '../services/membership-events';

/** FR-022: 5 failed code lookups per account in 15 minutes block lookups for 15 minutes. */
export const MAX_CODE_FAILURES = 5;
export const CODE_FAILURE_WINDOW_MS = 15 * 60_000;

interface Resolved {
  invitation: Invitation;
  budget: Budget;
}

/**
 * Finds the invitation behind a code typed or opened by a signed-in person and checks, in order:
 * lockout, existence (a miss counts as a failure), still usable (FR-021), sent to this person's
 * email (FR-010), not already a member (code not consumed).
 */
@Injectable()
export class InvitationLookup {
  constructor(
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(INVITE_CODE_FAILURE_LOG)
    private readonly failures: InviteCodeFailureLog,
    @Inject(INVITE_CODES) private readonly codes: InviteCodes,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async resolve(auth: AuthContext, rawCode: string): Promise<Resolved> {
    if (!auth.emailConfirmed) throw new DomainError('EMAIL_NOT_CONFIRMED');
    const now = this.clock.now();
    const recent = await this.failures.listSince(
      auth.userId,
      new Date(now.getTime() - CODE_FAILURE_WINDOW_MS),
    );
    if (recent.length >= MAX_CODE_FAILURES) {
      const unblockAt =
        recent[MAX_CODE_FAILURES - 1].getTime() + CODE_FAILURE_WINDOW_MS;
      throw new DomainError('RATE_LIMITED', {
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((unblockAt - now.getTime()) / 1000),
        ),
      });
    }

    const code = normalizeInviteCode(rawCode);
    const invitation = code
      ? await this.invitations.findByCodeHash(this.codes.hash(code))
      : null;
    const budget = invitation
      ? await this.budgets.findById(invitation.budgetId)
      : null;
    if (!invitation || !budget) {
      await this.failures.record(this.ids.next(), auth.userId, now);
      throw new DomainError('INVITATION_NOT_FOUND');
    }
    // A deleted budget's invitations were revoked at deletion (FR-038c).
    if (budget.isDeleted)
      throw new DomainError('INVITATION_REVOKED', {
        inviterName: invitation.inviterName,
      });
    invitation.assertUsable(now);

    if (invitation.kind === 'email') {
      const me = (await this.users.findByIds([auth.userId])).get(auth.userId);
      if (me?.emailNormalized !== invitation.emailNormalized)
        throw new DomainError('INVITATION_WRONG_EMAIL', {
          invitedEmailMasked: maskEmail(invitation.emailNormalized ?? ''),
        });
    }
    if (await this.memberships.findCurrent(budget.id, auth.userId))
      throw new DomainError('ALREADY_MEMBER', { budgetId: budget.id });
    return { invitation, budget };
  }
}

/** US2: what the invitation screen shows (FR-017). */
@Injectable()
export class PreviewInvitation {
  constructor(
    private readonly lookup: InvitationLookup,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
  ) {}

  async execute(auth: AuthContext, code: string): Promise<InvitationPreview> {
    const { invitation, budget } = await this.lookup.resolve(auth, code);
    return {
      budgetName: budget.name,
      inviterName: invitation.inviterName,
      role: invitation.role,
      expiresAt: invitation.expiresAt.toISOString(),
      memberCount: await this.memberships.countCurrent(budget.id),
    };
  }
}

/** US2: joins with the role chosen by the inviter; a single use per invitation (FR-012). */
@Injectable()
export class AcceptInvitation {
  constructor(
    private readonly lookup: InvitationLookup,
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: MembershipEvents,
  ) {}

  async execute(
    auth: AuthContext,
    code: string,
  ): Promise<AcceptInvitationResponse> {
    const { invitation } = await this.lookup.resolve(auth, code);
    return this.tx.run(async () => {
      const budget = await this.budgets.findByIdForUpdate(invitation.budgetId);
      if (!budget || budget.isDeleted)
        throw new DomainError('INVITATION_REVOKED', {
          inviterName: invitation.inviterName,
        });
      if (await this.memberships.findCurrent(budget.id, auth.userId))
        throw new DomainError('ALREADY_MEMBER', { budgetId: budget.id });
      const now = this.clock.now();
      if (
        !(await this.invitations.acceptIfPending(
          invitation.id,
          auth.userId,
          now,
        ))
      ) {
        const latest = await this.invitations.findById(invitation.id);
        throw new DomainError(latest?.goneReason(now) ?? 'INVITATION_USED', {
          inviterName: invitation.inviterName,
        });
      }
      // A former member rejoins as a new membership of the same user (edge case "former member rejoins").
      const membership = Membership.join({
        id: this.ids.next(),
        budgetId: budget.id,
        userId: auth.userId,
        role: invitation.role,
        now,
      });
      await this.memberships.save(membership);
      await this.events.record(
        budget.id,
        'joined',
        auth.userId,
        membership.id,
        {
          role: invitation.role,
        },
      );
      return {
        budgetId: budget.id,
        role: invitation.role,
        askIncome: invitation.role !== 'viewer',
        currentMonth: budget.currentMonth(now),
      };
    });
  }
}

/** US2: declining makes the invitation unusable and shows it as declined (FR-019). */
@Injectable()
export class DeclineInvitation {
  constructor(
    private readonly lookup: InvitationLookup,
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(BUDGET_REPOSITORY) private readonly budgets: BudgetRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(auth: AuthContext, code: string): Promise<void> {
    const { invitation } = await this.lookup.resolve(auth, code);
    await this.tx.run(async () => {
      await this.budgets.findByIdForUpdate(invitation.budgetId);
      const latest = await this.invitations.findById(invitation.id);
      if (!latest) throw new DomainError('INVITATION_NOT_FOUND');
      latest.decline(auth.userId, this.clock.now());
      await this.invitations.save(latest);
    });
  }
}
