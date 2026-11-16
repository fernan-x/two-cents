import { Inject, Injectable } from '@nestjs/common';
import {
  CLOCK,
  type Clock,
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { User } from '../../domain/entities/user';
import {
  SECURITY_EVENT_LOG,
  type SecurityEventLog,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import type { PlainPassword } from '../../domain/value-objects/plain-password';
import { IDENTITY_MAILER, type IdentityMailer } from '../ports/mailer';
import { PASSWORD_HASHER, type PasswordHasher } from '../ports/security';
import { recipientOf } from './recipient';

/**
 * Checks a password with lockout (FR-005): 5 consecutive failures lock the account for 15 minutes.
 * Used by login, account linking and re-authentication.
 */
@Injectable()
export class PasswordVerifier {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(IDENTITY_MAILER) private readonly mailer: IdentityMailer,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async verifyOrRecordFailure(
    user: User,
    password: PlainPassword,
  ): Promise<void> {
    user.assertNotLocked(this.clock.now());
    const ok =
      user.passwordHash !== null &&
      (await this.hasher.verify(user.passwordHash, password));
    if (!ok) {
      await this.tx.run(async () => {
        const fresh = (await this.users.findById(user.id)) ?? user;
        const locked = fresh.recordFailedLogin(this.clock.now());
        await this.users.save(fresh);
        await this.events.record({ type: 'login_failed', userId: fresh.id });
        if (locked) {
          await this.events.record({
            type: 'account_locked',
            userId: fresh.id,
          });
          this.mailer.send(recipientOf(fresh), {
            kind: 'account_locked',
            until: fresh.lockedUntil!,
          });
        }
      });
      throw new DomainError('INVALID_CREDENTIALS');
    }
    user.recordSuccessfulLogin(this.clock.now());
    if (this.hasher.needsRehash(user.passwordHash)) {
      user.changePassword(await this.hasher.hash(password), this.clock.now());
    }
    await this.users.save(user);
  }
}
