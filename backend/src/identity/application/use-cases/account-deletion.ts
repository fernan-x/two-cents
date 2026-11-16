import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DeletionPreviewResponse, Me } from '@two-cents/shared/contracts';
import { computeDeletionDate } from '@two-cents/shared/domain';
import {
  CLOCK,
  type Clock,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  AUTH_IDENTITY_REPOSITORY,
  type AuthIdentityRepository,
  SECURITY_EVENT_LOG,
  type SecurityEventLog,
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import {
  BUDGET_MEMBERSHIP_PORT,
  type BudgetMembershipPort,
} from '../ports/budgets';
import {
  IDENTITY_MAILER,
  type IdentityMailer,
  LINK_BUILDER,
  type LinkBuilder,
} from '../ports/mailer';
import {
  APPLE_CODE_EXCHANGER,
  type AppleCodeExchanger,
} from '../ports/providers';
import { SECRET_ENCRYPTOR, type SecretEncryptor } from '../ports/security';
import { EmailTokenIssuer } from '../services/email-token-issuer';
import { MeView } from '../services/me-view';
import { recipientOf } from '../services/recipient';
import { ReauthTokenChecker } from './reauthenticate';

/** US8: what deleting the account will do, shown before confirming (FR-041). */
@Injectable()
export class PreviewDeletion {
  constructor(
    @Inject(BUDGET_MEMBERSHIP_PORT)
    private readonly budgets: BudgetMembershipPort,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(userId: string): Promise<DeletionPreviewResponse> {
    const preview = await this.budgets.previewMemberDeletion(userId);
    return {
      ...preview,
      scheduledAt: computeDeletionDate(this.clock.now()).toISOString(),
    };
  }
}

/** US8: starts the 7-day grace period (FR-041a). Requires a fresh re-authentication. */
@Injectable()
export class RequestDeletion {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(BUDGET_MEMBERSHIP_PORT)
    private readonly budgets: BudgetMembershipPort,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(IDENTITY_MAILER) private readonly mailer: IdentityMailer,
    @Inject(LINK_BUILDER) private readonly links: LinkBuilder,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly reauth: ReauthTokenChecker,
    private readonly tokens: EmailTokenIssuer,
  ) {}

  async execute(
    auth: { userId: string; sessionId: string },
    reauthToken: string | undefined,
  ): Promise<{ deletionScheduledAt: string }> {
    await this.reauth.consume(auth.sessionId, reauthToken);
    return this.tx.run(async () => {
      const user = await this.users.findById(auth.userId);
      if (!user) throw new DomainError('UNAUTHENTICATED');
      const now = this.clock.now();
      const scheduledAt = user.requestDeletion(now);
      await this.users.save(user);
      await this.sessions.revokeAllForUser(user.id, 'account_deletion', now);
      await this.budgets.cancelInvitationsSentBy(user.id);
      const token = await this.tokens.issue(user.id, 'cancel_deletion', {
        deletionScheduledAt: scheduledAt,
      });
      await this.events.record({ type: 'deletion_requested', userId: user.id });
      this.mailer.send(recipientOf(user), {
        kind: 'deletion_scheduled',
        link: this.links.build('cancel-deletion', token),
        scheduledAt,
      });
      return { deletionScheduledAt: scheduledAt.toISOString() };
    });
  }
}

/** US8: cancel by signing in during the grace period (FR-041b). */
@Injectable()
export class CancelDeletion {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly meView: MeView,
  ) {}

  execute(userId: string): Promise<Me> {
    return this.tx.run(async () => {
      const user = await this.users.findById(userId);
      if (!user) throw new DomainError('UNAUTHENTICATED');
      user.cancelDeletion(this.clock.now());
      await this.users.save(user);
      await this.events.record({ type: 'deletion_cancelled', userId });
      return this.meView.build(user);
    });
  }
}

/** US8: cancel through the link in the "deletion scheduled" email. */
@Injectable()
export class CancelDeletionByLink {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tokens: EmailTokenIssuer,
  ) {}

  execute(token: string): Promise<void> {
    return this.tx.run(async () => {
      const consumed = await this.tokens.consume(token, 'cancel_deletion');
      const user = await this.users.findById(consumed.userId);
      if (!user || user.status !== 'pending_deletion')
        throw new DomainError('TOKEN_INVALID');
      user.cancelDeletion(this.clock.now());
      await this.users.save(user);
      await this.events.record({ type: 'deletion_cancelled', userId: user.id });
    });
  }
}

/**
 * US8: permanent deletion once the grace period is over (FR-042, FR-043). One transaction per account:
 * budgets first (through spec 002's port), then the user row, whose foreign keys cascade to sessions,
 * identities and tokens, and set security events' user to NULL. Apple tokens are revoked afterwards.
 */
@Injectable()
export class FinalizeDeletion {
  private readonly logger = new Logger(FinalizeDeletion.name);

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUTH_IDENTITY_REPOSITORY)
    private readonly identities: AuthIdentityRepository,
    @Inject(BUDGET_MEMBERSHIP_PORT)
    private readonly budgets: BudgetMembershipPort,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(IDENTITY_MAILER) private readonly mailer: IdentityMailer,
    @Inject(APPLE_CODE_EXCHANGER) private readonly apple: AppleCodeExchanger,
    @Inject(SECRET_ENCRYPTOR) private readonly encryptor: SecretEncryptor,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Returns how many accounts were deleted. Safe to run concurrently with itself (each account re-checked). */
  async execute(batchSize = 50): Promise<number> {
    const due = await this.users.findDueForDeletion(
      this.clock.now(),
      batchSize,
    );
    let deleted = 0;
    for (const candidate of due) {
      const appleTokens = await this.tx.run(async () => {
        const user = await this.users.findById(candidate.id);
        if (!user || !user.isDueForDeletion(this.clock.now())) return null;
        const identities = await this.identities.listByUser(user.id);
        await this.budgets.finalizeMemberDeletion(user.id);
        this.mailer.send(recipientOf(user), { kind: 'account_deleted' });
        await this.users.delete(user.id);
        await this.events.record({ type: 'account_deleted', userId: null });
        return identities.flatMap((i) =>
          i.provider === 'apple' && i.appleRefreshTokenEnc
            ? [i.appleRefreshTokenEnc]
            : [],
        );
      });
      if (appleTokens === null) continue;
      deleted += 1;
      for (const encrypted of appleTokens)
        await this.revokeWithRetry(this.encryptor.decrypt(encrypted));
    }
    return deleted;
  }

  private async revokeWithRetry(
    refreshToken: string,
    attempts = 3,
  ): Promise<void> {
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await this.apple.revoke(refreshToken);
        return;
      } catch (error) {
        if (attempt === attempts)
          this.logger.warn({ err: error }, 'Apple token revocation failed');
      }
    }
  }
}
