import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatedInvitation,
  InvitationView,
} from '@two-cents/shared/contracts';
import { canInvite, formatInviteCode } from '@two-cents/shared/domain';
import {
  CLOCK,
  type Clock,
  EVENT_PUBLISHER,
  type EventPublisher,
  ID_GENERATOR,
  type IdGenerator,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { AuthContext } from '../../../identity/application/services/authenticator';
import type { Budget } from '../../domain/entities/budget';
import { Invitation } from '../../domain/entities/invitation';
import type { AssignableRole } from '../../domain/entities/membership';
import {
  INVITATION_REPOSITORY,
  type InvitationRepository,
  INVITE_CODE_FAILURE_LOG,
  type InviteCodeFailureLog,
  MEMBERSHIP_REPOSITORY,
  type MembershipRepository,
} from '../../domain/ports/repositories';
import {
  INVITATION_LINKS,
  type InvitationLinks,
  INVITE_CODES,
  type InviteCodes,
  USER_DIRECTORY,
  type UserDirectory,
} from '../ports';
import { BudgetAccess } from '../services/budget-access';
import { MembershipEvents } from '../services/membership-events';

export type CreateInvitationInput =
  | { kind: 'email'; email: string; role: AssignableRole }
  | { kind: 'code'; role: AssignableRole };

export function invitationView(inv: Invitation, now: Date): InvitationView {
  return {
    id: inv.id,
    kind: inv.kind,
    email: inv.emailNormalized,
    role: inv.role,
    status: inv.status(now),
    invitedBy: inv.inviterName,
    lastSentAt: inv.lastSentAt.toISOString(),
    expiresAt: inv.expiresAt.toISOString(),
  };
}

/**
 * Issues a fresh code for an invitation and publishes the email when it has an address. The code is
 * only ever in memory here and in the outbox message; the database keeps its HMAC (R6).
 */
@Injectable()
export class InvitationSender {
  constructor(
    @Inject(INVITE_CODES) private readonly codes: InviteCodes,
    @Inject(INVITATION_LINKS) private readonly links: InvitationLinks,
    @Inject(EVENT_PUBLISHER) private readonly publisher: EventPublisher,
  ) {}

  newCode(): { code: string; hash: string } {
    const code = this.codes.generate();
    return { code, hash: this.codes.hash(code) };
  }

  async announce(
    inv: Invitation,
    budget: Budget,
    code: string,
    now: Date,
    resent: boolean,
  ): Promise<CreatedInvitation> {
    const formatted = formatInviteCode(code);
    const link = this.links.forCode(formatted);
    if (inv.kind === 'email' && inv.emailNormalized)
      await this.publisher.publish('invitation.sent', {
        invitationId: inv.id,
        recipientEmail: inv.emailNormalized,
        inviterFirstName: inv.inviterName,
        budgetName: budget.name,
        role: inv.role,
        link,
        code: formatted,
        expiresAt: inv.expiresAt.toISOString(),
      });
    return { ...invitationView(inv, now), code: formatted, link, resent };
  }
}

/**
 * US2/US4: invite by email or code (FR-008, FR-011). An email that already has a pending invitation
 * gets it again (FR-014); a current member's email is refused (FR-013); at most 6 people (FR-023).
 */
@Injectable()
export class CreateInvitation {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly memberships: MembershipRepository,
    @Inject(USER_DIRECTORY) private readonly users: UserDirectory,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sender: InvitationSender,
    private readonly events: MembershipEvents,
  ) {}

  execute(
    auth: AuthContext,
    budgetId: string,
    input: CreateInvitationInput,
  ): Promise<CreatedInvitation> {
    if (!auth.emailConfirmed) throw new DomainError('EMAIL_NOT_CONFIRMED');
    return this.tx.run(async () => {
      const { budget } = await this.access.require(
        budgetId,
        auth.userId,
        'invitations.manage',
        { forUpdate: true },
      );
      const now = this.clock.now();
      const email =
        input.kind === 'email' ? input.email.trim().toLowerCase() : null;

      if (email) {
        const current = (await this.memberships.listByBudget(budget.id)).filter(
          (m) => m.isCurrent && m.userId,
        );
        const users = await this.users.findByIds(current.map((m) => m.userId!));
        if ([...users.values()].some((u) => u.emailNormalized === email))
          throw new DomainError('ALREADY_MEMBER');

        const existing = await this.invitations.findPendingByEmail(
          budget.id,
          email,
        );
        if (existing?.isEffectivelyPending(now)) {
          const { code, hash } = this.sender.newCode();
          existing.resend(now, hash);
          await this.invitations.save(existing);
          await this.events.record(
            budget.id,
            'invitation_sent',
            auth.userId,
            null,
            {
              role: existing.role,
              kind: 'email',
            },
          );
          return this.sender.announce(existing, budget, code, now, true);
        }
        // A pending row past its expiry still holds the unique slot: tidy it first.
        if (existing) {
          await this.invitations.expireDue(now);
        }
      }

      const [members, pending] = await Promise.all([
        this.memberships.countCurrent(budget.id),
        this.invitations.countEffectivelyPending(budget.id, now),
      ]);
      if (!canInvite({ currentMembers: members, pendingInvitations: pending }))
        throw new DomainError('BUDGET_FULL');

      const { code, hash } = this.sender.newCode();
      const invitation = Invitation.create({
        id: this.ids.next(),
        budgetId: budget.id,
        kind: input.kind,
        emailNormalized: email,
        role: input.role,
        codeHash: hash,
        invitedBy: auth.userId,
        inviterName: auth.firstName,
        now,
      });
      await this.invitations.save(invitation);
      await this.events.record(
        budget.id,
        'invitation_sent',
        auth.userId,
        null,
        {
          role: input.role,
          kind: input.kind,
        },
      );
      return this.sender.announce(invitation, budget, code, now, false);
    });
  }
}

/** US4: the invitations of a budget, pending only by default (FR-020). */
@Injectable()
export class ListInvitations {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(
    auth: AuthContext,
    budgetId: string,
    status: 'pending' | 'all',
  ): Promise<InvitationView[]> {
    await this.access.require(budgetId, auth.userId, 'invitations.manage');
    const now = this.clock.now();
    return (await this.invitations.listByBudget(budgetId))
      .filter((inv) => status === 'all' || inv.isEffectivelyPending(now))
      .map((inv) => invitationView(inv, now));
  }
}

async function findInBudget(
  invitations: InvitationRepository,
  budgetId: string,
  invitationId: string,
): Promise<Invitation> {
  const inv = await invitations.findById(invitationId);
  if (!inv || inv.budgetId !== budgetId) throw new DomainError('NOT_FOUND');
  return inv;
}

/**
 * US4: sends it again with a fresh 7-day expiry (FR-012). A new code is issued every time, since
 * only the HMAC of the old one is known; the previous link stops working.
 */
@Injectable()
export class ResendInvitation {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sender: InvitationSender,
    private readonly events: MembershipEvents,
  ) {}

  execute(
    auth: AuthContext,
    budgetId: string,
    invitationId: string,
  ): Promise<CreatedInvitation> {
    return this.tx.run(async () => {
      const { budget } = await this.access.require(
        budgetId,
        auth.userId,
        'invitations.manage',
        { forUpdate: true },
      );
      const now = this.clock.now();
      const inv = await findInBudget(this.invitations, budgetId, invitationId);
      const { code, hash } = this.sender.newCode();
      inv.resend(now, hash);
      await this.invitations.save(inv);
      await this.events.record(
        budget.id,
        'invitation_sent',
        auth.userId,
        null,
        {
          role: inv.role,
          kind: inv.kind,
        },
      );
      return this.sender.announce(inv, budget, code, now, true);
    });
  }
}

/** US4: the link and code stop working at once (US4 scenario 3). */
@Injectable()
export class RevokeInvitation {
  constructor(
    private readonly access: BudgetAccess,
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly events: MembershipEvents,
  ) {}

  execute(
    auth: AuthContext,
    budgetId: string,
    invitationId: string,
  ): Promise<void> {
    return this.tx.run(async () => {
      await this.access.require(budgetId, auth.userId, 'invitations.manage', {
        forUpdate: true,
      });
      const inv = await findInBudget(this.invitations, budgetId, invitationId);
      inv.revoke(auth.userId, this.clock.now());
      await this.invitations.save(inv);
      await this.events.record(
        budgetId,
        'invitation_revoked',
        auth.userId,
        null,
        {
          role: inv.role,
          kind: inv.kind,
        },
      );
    });
  }
}

/** Tidies pending invitations past their expiry; reads already treat them as expired (R12). */
@Injectable()
export class ExpireInvitations {
  constructor(
    @Inject(INVITATION_REPOSITORY)
    private readonly invitations: InvitationRepository,
    @Inject(INVITE_CODE_FAILURE_LOG)
    private readonly failures: InviteCodeFailureLog,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const now = this.clock.now();
    await this.failures.deleteBefore(new Date(now.getTime() - 86_400_000));
    return this.invitations.expireDue(now);
  }
}
