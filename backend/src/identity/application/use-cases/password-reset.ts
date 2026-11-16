import { Inject, Injectable } from '@nestjs/common';
import { normalizeEmail } from '@two-cents/shared/domain';
import {
  CLOCK,
  type Clock,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  SECURITY_EVENT_LOG,
  type SecurityEventLog,
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import { PlainPassword } from '../../domain/value-objects/plain-password';
import {
  IDENTITY_MAILER,
  type IdentityMailer,
  LINK_BUILDER,
  type LinkBuilder,
} from '../ports/mailer';
import {
  BREACHED_PASSWORD_CHECKER,
  type BreachedPasswordChecker,
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../ports/security';
import { EmailTokenIssuer } from '../services/email-token-issuer';
import { recipientOf } from '../services/recipient';

/** US4: emails a 1 h single-use reset link; silent when the email is unknown (FR-006). */
@Injectable()
export class RequestPasswordReset {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(IDENTITY_MAILER) private readonly mailer: IdentityMailer,
    @Inject(LINK_BUILDER) private readonly links: LinkBuilder,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    private readonly tokens: EmailTokenIssuer,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.users.findByNormalizedEmail(normalizeEmail(email));
    if (!user) return;
    await this.tx.run(async () => {
      const token = await this.tokens.issue(user.id, 'reset_password');
      await this.events.record({
        type: 'password_reset_requested',
        userId: user.id,
      });
      this.mailer.send(recipientOf(user), {
        kind: 'reset_password',
        link: this.links.build('reset', token),
      });
    });
  }
}

/** US4: sets the new password, ends every session and lifts the lockout (FR-031, FR-032). */
@Injectable()
export class CompletePasswordReset {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(BREACHED_PASSWORD_CHECKER)
    private readonly breach: BreachedPasswordChecker,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(IDENTITY_MAILER) private readonly mailer: IdentityMailer,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tokens: EmailTokenIssuer,
  ) {}

  async execute(input: { token: string; newPassword: string }): Promise<void> {
    const password = PlainPassword.create(input.newPassword);
    if (await this.breach.isBreached(password))
      throw new DomainError('PASSWORD_BREACHED');
    const hash = await this.hasher.hash(password);
    await this.tx.run(async () => {
      const token = await this.tokens.consume(input.token, 'reset_password');
      const user = await this.users.findById(token.userId);
      if (!user) throw new DomainError('TOKEN_INVALID');
      const now = this.clock.now();
      user.changePassword(hash, now);
      await this.users.save(user);
      await this.sessions.revokeAllForUser(user.id, 'password_changed', now);
      await this.events.record({ type: 'password_reset', userId: user.id });
      this.mailer.send(recipientOf(user), {
        kind: 'password_changed',
        at: now,
      });
    });
  }
}
