import { Inject, Injectable } from '@nestjs/common';
import type { AuthResult, SignUpRequest } from '@two-cents/shared/contracts';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import { User } from '../../domain/entities/user';
import {
  SECURITY_EVENT_LOG,
  type SecurityEventLog,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import { Email } from '../../domain/value-objects/email';
import { FirstName } from '../../domain/value-objects/first-name';
import { toLocale } from '../../domain/value-objects/locale';
import { PlainPassword } from '../../domain/value-objects/plain-password';
import {
  BREACHED_PASSWORD_CHECKER,
  type BreachedPasswordChecker,
  PASSWORD_HASHER,
  type PasswordHasher,
} from '../ports/security';
import { EmailConfirmationSender } from '../services/email-confirmation-sender';
import { SessionIssuer } from '../services/session-issuer';

/** US1: create an account with email + password and sign in right away. */
@Injectable()
export class SignUp {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(BREACHED_PASSWORD_CHECKER)
    private readonly breach: BreachedPasswordChecker,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly sessions: SessionIssuer,
    private readonly confirmation: EmailConfirmationSender,
  ) {}

  async execute(input: SignUpRequest): Promise<AuthResult> {
    const email = Email.create(input.email);
    const firstName = FirstName.create(input.firstName);
    const password = PlainPassword.create(input.password);
    await this.assertEmailFree(email);
    if (await this.breach.isBreached(password))
      throw new DomainError('PASSWORD_BREACHED');
    const passwordHash = await this.hasher.hash(password);

    return this.tx.run(async () => {
      await this.assertEmailFree(email);
      const user = User.register({
        id: this.ids.next(),
        email,
        firstName,
        locale: toLocale(input.locale),
        passwordHash,
        emailConfirmed: false,
        now: this.clock.now(),
      });
      await this.users.save(user);
      const { sessionId, ...result } = await this.sessions.open(
        user,
        'password',
        input.device,
      );
      await this.events.record({ type: 'signup', userId: user.id, sessionId });
      await this.confirmation.send(user);
      return result;
    });
  }

  private async assertEmailFree(email: Email): Promise<void> {
    const existing = await this.users.findByNormalizedEmail(email.normalized);
    if (!existing) return;
    if (existing.status === 'pending_deletion')
      throw new DomainError('ACCOUNT_PENDING_DELETION', { status: 409 });
    throw new DomainError('EMAIL_IN_USE');
  }
}
