import { Inject, Injectable } from '@nestjs/common';
import type { AuthResult, DeviceInfo } from '@two-cents/shared/contracts';
import {
  CLOCK,
  type Clock,
  ID_GENERATOR,
  type IdGenerator,
} from '../../../shared-kernel/application/ports';
import { type AuthMethod, Session } from '../../domain/entities/session';
import type { User } from '../../domain/entities/user';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from '../../domain/ports/repositories';
import {
  ACCESS_TOKEN_ISSUER,
  type AccessTokenIssuer,
  SECRET_TOKEN_GENERATOR,
  type SecretTokenGenerator,
} from '../ports/security';
import { MeView } from './me-view';

/** Opens a session for a signed-in user and returns tokens + `Me` (research R5). */
@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(SESSION_REPOSITORY) private readonly sessions: SessionRepository,
    @Inject(SECRET_TOKEN_GENERATOR)
    private readonly secrets: SecretTokenGenerator,
    @Inject(ACCESS_TOKEN_ISSUER)
    private readonly accessTokens: AccessTokenIssuer,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly meView: MeView,
  ) {}

  async open(
    user: User,
    authMethod: AuthMethod,
    device: DeviceInfo,
  ): Promise<AuthResult & { sessionId: string }> {
    const refresh = this.secrets.generate();
    const session = Session.open({
      id: this.ids.next(),
      userId: user.id,
      authMethod,
      refreshTokenHash: refresh.hash,
      device,
      now: this.clock.now(),
    });
    await this.sessions.save(session);
    const access = await this.accessTokens.issue(user.id, session.id);
    return {
      sessionId: session.id,
      tokens: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        refreshToken: refresh.token,
      },
      me: await this.meView.build(user),
    };
  }
}
