import { createPrivateKey } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { SignJWT } from 'jose';
import { CLOCK, type Clock } from '../../../shared-kernel/application/ports';
import {
  ENV,
  type Env,
} from '../../../shared-kernel/infrastructure/config/env';
import type { AppleCodeExchanger } from '../../application/ports/providers';
import { APPLE_ISSUER } from './apple-identity-verifier';

/**
 * Talks to Apple's REST API with an ES256 client secret signed by the .p8 key (research R8).
 * Endpoint details still need checking against Apple's portal (tasks T071).
 */
@Injectable()
export class AppleRestCodeExchanger implements AppleCodeExchanger {
  private readonly logger = new Logger(AppleRestCodeExchanger.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  private configured(): boolean {
    return Boolean(
      this.env.APPLE_TEAM_ID &&
      this.env.APPLE_KEY_ID &&
      this.env.APPLE_PRIVATE_KEY &&
      this.env.APPLE_BUNDLE_ID,
    );
  }

  private async clientSecret(): Promise<string> {
    const key = createPrivateKey(
      this.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    );
    const now = Math.floor(this.clock.now().getTime() / 1000);
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.env.APPLE_KEY_ID })
      .setIssuer(this.env.APPLE_TEAM_ID)
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .setAudience(APPLE_ISSUER)
      .setSubject(this.env.APPLE_BUNDLE_ID)
      .sign(key);
  }

  async exchange(authorizationCode: string): Promise<string | null> {
    if (!this.configured()) return null;
    try {
      const response = await fetch(`${APPLE_ISSUER}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.env.APPLE_BUNDLE_ID,
          client_secret: await this.clientSecret(),
          code: authorizationCode,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { refresh_token?: string };
      return body.refresh_token ?? null;
    } catch (error) {
      this.logger.warn({ err: error }, 'Apple code exchange failed');
      return null;
    }
  }

  async revoke(refreshToken: string): Promise<void> {
    if (!this.configured()) return;
    const response = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.env.APPLE_BUNDLE_ID,
        client_secret: await this.clientSecret(),
        token: refreshToken,
        token_type_hint: 'refresh_token',
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error(`Apple revoke failed with status ${response.status}`);
  }
}
