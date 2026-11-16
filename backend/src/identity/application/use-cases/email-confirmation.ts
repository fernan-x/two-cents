import { Inject, Injectable } from '@nestjs/common';
import type { Me } from '@two-cents/shared/contracts';
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
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import { EmailConfirmationSender } from '../services/email-confirmation-sender';
import { EmailTokenIssuer } from '../services/email-token-issuer';
import { MeView } from '../services/me-view';

/** US3: opening the emailed link confirms the address (FR-010). */
@Injectable()
export class ConfirmEmail {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly tokens: EmailTokenIssuer,
    private readonly meView: MeView,
  ) {}

  execute(token: string): Promise<{ me: Me }> {
    return this.tx.run(async () => {
      const consumed = await this.tokens.consume(token, 'confirm_email');
      const user = await this.users.findById(consumed.userId);
      if (!user) throw new DomainError('TOKEN_INVALID');
      if (!user.emailConfirmed) {
        user.confirmEmail(this.clock.now());
        await this.users.save(user);
        await this.events.record({ type: 'email_confirmed', userId: user.id });
      }
      return { me: await this.meView.build(user) };
    });
  }
}

/** US3: sends a fresh link; the previous one stops working. */
@Injectable()
export class ResendConfirmation {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    private readonly sender: EmailConfirmationSender,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) throw new DomainError('UNAUTHENTICATED');
    if (user.emailConfirmed) throw new DomainError('ALREADY_CONFIRMED');
    await this.tx.run(() => this.sender.send(user));
  }
}
