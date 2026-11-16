import { Inject, Injectable } from '@nestjs/common';
import type {
  AuthResult,
  LoginRequest,
  Me,
  Tokens,
} from '@two-cents/shared/contracts';
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
  ACCESS_TOKEN_ISSUER,
  type AccessTokenIssuer,
  PASSWORD_HASHER,
  type PasswordHasher,
  SECRET_TOKEN_GENERATOR,
  type SecretTokenGenerator,
} from '../ports/security';
import { MeView } from '../services/me-view';
import { PasswordVerifier } from '../services/password-verifier';
import { SessionIssuer } from '../services/session-issuer';

/** US2: email + password login with lockout. Never reveals whether the email exists (FR-006). */
@Injectable()
export class LogIn {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    private readonly passwords: PasswordVerifier,
    private readonly sessions: SessionIssuer,
  ) {}

  async execute(input: LoginRequest): Promise<AuthResult> {
    const password = PlainPassword.forVerification(input.password);
    const user = await this.users.findByNormalizedEmail(
      normalizeEmail(input.email),
    );
    if (!user) {
      await this.hasher.verifyDummy(password);
      throw new DomainError('INVALID_CREDENTIALS');
    }
    await this.passwords.verifyOrRecordFailure(user, password);
    return this.tx.run(async () => {
      const { sessionId, ...result } = await this.sessions.open(
        user,
        'password',
        input.device,
      );
      await this.events.record({
        type: 'login_succeeded',
        userId: user.id,
        sessionId,
      });
      return result;
    });
  }
}

/** US2: silent refresh with rotation and theft detection (research R5). */
@Injectable()
export class RefreshSession {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(SECRET_TOKEN_GENERATOR)
    private readonly secrets: SecretTokenGenerator,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly accessTokens: AccessTokenIssuer,
    @Inject(SECURITY_EVENT_LOG) private readonly events: SecurityEventLog,
    @Inject(TRANSACTION_RUNNER) private readonly tx: TransactionRunner,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(refreshToken: string): Promise<{ tokens: Tokens }> {
    const hash = this.secrets.hash(refreshToken);
    const now = this.clock.now();
    const session = await this.sessions.findByRefreshHash(hash);
    if (!session) {
      const stolen = await this.sessions.findByPreviousRefreshHash(hash);
      if (stolen) {
        const wasActive = stolen.isActive(now);
        stolen.revoke('reuse_detected', now);
        await this.sessions.save(stolen);
        if (wasActive)
          await this.events.record({
            type: 'session_revoked',
            userId: stolen.userId,
            sessionId: stolen.id,
          });
        throw new DomainError('SESSION_ENDED', {
          reason: stolen.revokedReason ?? 'reuse_detected',
        });
      }
      throw new DomainError('SESSION_ENDED', { reason: 'expired' });
    }
    if (!session.isActive(now))
      throw new DomainError('SESSION_ENDED', {
        reason: session.revokedReason ?? 'expired',
      });

    const next = this.secrets.generate();
    session.rotate(next.hash, now);
    await this.tx.run(() => this.sessions.save(session));
    const access = await this.accessTokens.issue(session.userId, session.id);
    return {
      tokens: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        refreshToken: next.token,
      },
    };
  }
}

/** US2: ends the current session on the server (FR-024). */
@Injectable()
export class LogOut {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(sessionId: string): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    if (!session) return;
    session.revoke('logout', this.clock.now());
    await this.sessions.save(session);
  }
}

@Injectable()
export class GetMe {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly meView: MeView,
  ) {}

  async execute(userId: string): Promise<Me> {
    const user = await this.users.findById(userId);
    if (!user)
      throw new DomainError('SESSION_ENDED', { reason: 'account_deletion' });
    return this.meView.build(user);
  }
}
