import { Inject, Injectable } from '@nestjs/common';
import { jwtVerify, SignJWT } from 'jose';
import { CLOCK, type Clock } from '../../../shared-kernel/application/ports';
import {
  ENV,
  type Env,
} from '../../../shared-kernel/infrastructure/config/env';
import type { AccessTokenIssuer } from '../../application/ports/security';

export const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000;
const AUDIENCE = 'two-cents-api';

/** Short-lived HS256 access token carrying the user and session ids (research R5). */
@Injectable()
export class JoseAccessTokenIssuer implements AccessTokenIssuer {
  private readonly key: Uint8Array;

  constructor(
    @Inject(ENV) env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {
    this.key = new Uint8Array(Buffer.from(env.JWT_SECRET, 'base64'));
  }

  async issue(
    userId: string,
    sessionId: string,
  ): Promise<{ token: string; expiresAt: Date }> {
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS);
    const token = await new SignJWT({ sid: sessionId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setAudience(AUDIENCE)
      .setIssuedAt(Math.floor(now.getTime() / 1000))
      .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
      .sign(this.key);
    return { token, expiresAt };
  }

  async verify(
    token: string,
  ): Promise<{ userId: string; sessionId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        audience: AUDIENCE,
        currentDate: this.clock.now(),
      });
      if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string')
        return null;
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      return null;
    }
  }
}
