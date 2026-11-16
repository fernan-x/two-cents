import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import {
  AUTH_IDENTITY_REPOSITORY,
  type AuthIdentityRepository,
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import {
  APPLE_NOTIFICATION_VERIFIER,
  type AppleNotificationVerifier,
} from '../ports/providers';

/** Apple tells us when a user stops using Sign in with Apple or changes email forwarding (research R8). */
@Injectable()
export class HandleAppleNotification {
  constructor(
    @Inject(APPLE_NOTIFICATION_VERIFIER)
    private readonly verifier: AppleNotificationVerifier,
    @Inject(AUTH_IDENTITY_REPOSITORY)
    private readonly identities: AuthIdentityRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Unknown or invalid notifications are ignored (Apple only needs a 200). */
  async execute(payload: string): Promise<void> {
    const event = await this.verifier.verifyNotification(payload);
    if (!event) return;
    await this.tx.run(async () => {
      const identity = await this.identities.findByProviderSubject(
        'apple',
        event.subject,
      );
      if (!identity) return;
      const now = this.clock.now();
      if (event.type === 'consent-revoked' || event.type === 'account-delete') {
        await this.identities.delete(identity.id);
        for (const session of await this.sessions.listActiveByUser(
          identity.userId,
          now,
        )) {
          if (session.authMethod === 'apple') {
            session.revoke('provider_revoked', now);
            await this.sessions.save(session);
          }
        }
        return;
      }
      const user = await this.users.findById(identity.userId);
      if (!user) return;
      user.setEmailDeliverable(event.type === 'email-enabled', now);
      await this.users.save(user);
    });
  }
}
