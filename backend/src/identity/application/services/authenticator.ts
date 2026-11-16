import { Inject, Injectable } from '@nestjs/common';
import { CLOCK, type Clock } from '../../../shared-kernel/application/ports';
import { DomainError } from '../../../shared-kernel/domain/domain-error';
import type { UserStatus } from '../../domain/entities/user';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
  USER_REPOSITORY,
  type UserRepository,
} from '../../domain/ports/repositories';
import { ACCESS_TOKEN_ISSUER, type AccessTokenIssuer } from '../ports/security';

/** What the AuthGuard attaches to each request (contract expected by spec 002 R4). */
export interface AuthContext {
  userId: string;
  sessionId: string;
  emailConfirmed: boolean;
  firstName: string;
  status: UserStatus;
}

/** Checks an access token against a live session on every request, so revocation is immediate (SC-006). */
@Injectable()
export class Authenticator {
  constructor(
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly accessTokens: AccessTokenIssuer,
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async authenticate(accessToken: string | undefined): Promise<AuthContext> {
    if (!accessToken) throw new DomainError('UNAUTHENTICATED');
    const claims = await this.accessTokens.verify(accessToken);
    if (!claims) throw new DomainError('UNAUTHENTICATED');
    const session = await this.sessions.findById(claims.sessionId);
    if (!session || session.userId !== claims.userId) {
      throw new DomainError('SESSION_ENDED', { reason: 'account_deletion' });
    }
    if (!session.isActive(this.clock.now())) {
      throw new DomainError('SESSION_ENDED', {
        reason: session.revokedReason ?? 'expired',
      });
    }
    const user = await this.users.findById(claims.userId);
    if (!user)
      throw new DomainError('SESSION_ENDED', { reason: 'account_deletion' });
    return {
      userId: user.id,
      sessionId: session.id,
      emailConfirmed: user.emailConfirmed,
      firstName: user.firstName,
      status: user.status,
    };
  }
}
