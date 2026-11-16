import { Inject, Injectable } from '@nestjs/common';
import type { ReauthenticateRequest } from '@two-cents/shared/contracts';
import { CLOCK, type Clock } from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import {
  AUTH_IDENTITY_REPOSITORY,
  type AuthIdentityRepository,
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import { PlainPassword } from '../../domain/value-objects/plain-password';
import {
  APPLE_IDENTITY_VERIFIER,
  GOOGLE_IDENTITY_VERIFIER,
  type ProviderIdentityVerifier,
} from '../ports/providers';
import {
  SECRET_TOKEN_GENERATOR,
  type SecretTokenGenerator,
} from '../ports/security';
import { PasswordVerifier } from '../services/password-verifier';

/**
 * Proves it's still the account owner on this session: biometric fallback (US5, FR-037)
 * and account deletion (US8). Returns a 5-minute single-use token bound to the session.
 */
@Injectable()
export class Reauthenticate {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(AUTH_IDENTITY_REPOSITORY)
    private readonly identities: AuthIdentityRepository,
    @Inject(APPLE_IDENTITY_VERIFIER)
    private readonly apple: ProviderIdentityVerifier,
    @Inject(GOOGLE_IDENTITY_VERIFIER)
    private readonly google: ProviderIdentityVerifier,
    @Inject(SECRET_TOKEN_GENERATOR)
    private readonly secrets: SecretTokenGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly passwords: PasswordVerifier,
  ) {}

  async execute(
    auth: { userId: string; sessionId: string },
    input: ReauthenticateRequest,
  ): Promise<{ reauthToken: string; expiresAt: string }> {
    const user = await this.users.findById(auth.userId);
    if (!user) throw new DomainError('UNAUTHENTICATED');

    if ('password' in input) {
      await this.passwords.verifyOrRecordFailure(
        user,
        PlainPassword.forVerification(input.password),
      );
    } else {
      const claims =
        input.provider === 'apple'
          ? await this.apple.verify(input.identityToken)
          : await this.google.verify(input.idToken);
      const identity = claims
        ? await this.identities.findByProviderSubject(
            input.provider,
            claims.subject,
          )
        : null;
      if (!identity || identity.userId !== user.id)
        throw new DomainError('INVALID_CREDENTIALS');
    }

    const session = await this.sessions.findById(auth.sessionId);
    if (!session) throw new DomainError('UNAUTHENTICATED');
    const { token, hash } = this.secrets.generate();
    const expiresAt = session.issueReauthToken(hash, this.clock.now());
    await this.sessions.save(session);
    return { reauthToken: token, expiresAt: expiresAt.toISOString() };
  }
}

/** Used by actions that need a fresh proof (e.g. DELETE /me): consumes the session's re-auth token. */
@Injectable()
export class ReauthTokenChecker {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(SECRET_TOKEN_GENERATOR)
    private readonly secrets: SecretTokenGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async consume(
    sessionId: string,
    reauthToken: string | undefined,
  ): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    const ok =
      Boolean(reauthToken) &&
      session !== null &&
      session.consumeReauthToken(
        this.secrets.hash(reauthToken!),
        this.clock.now(),
      );
    if (session) await this.sessions.save(session);
    if (!ok) throw new DomainError('REAUTH_REQUIRED');
  }
}
