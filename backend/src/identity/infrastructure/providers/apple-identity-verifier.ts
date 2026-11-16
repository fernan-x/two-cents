import { Inject, Injectable } from '@nestjs/common';
import type { JWTVerifyGetKey } from 'jose';
import {
  ENV,
  type Env,
} from '../../../shared-kernel/infrastructure/config/env';
import type {
  AppleNotificationType,
  AppleNotificationVerifier,
  ProviderClaims,
  ProviderIdentityVerifier,
} from '../../application/ports/providers';
import { asBoolean, remoteJwks, verifyWithJwks } from './jwks-verifier';

export const APPLE_ISSUER = 'https://appleid.apple.com';
export const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

@Injectable()
export class AppleIdentityVerifier
  implements ProviderIdentityVerifier, AppleNotificationVerifier
{
  private keys: JWTVerifyGetKey | null = null;

  constructor(
    @Inject(ENV) private readonly env: Pick<Env, 'APPLE_BUNDLE_ID'>,
  ) {}

  /** For tests: use a local key set instead of Apple's. */
  useKeys(keys: JWTVerifyGetKey): void {
    this.keys = keys;
  }

  async verify(token: string): Promise<ProviderClaims | null> {
    this.keys ??= remoteJwks(APPLE_JWKS_URL);
    const payload = await verifyWithJwks(token, this.keys, {
      issuer: APPLE_ISSUER,
      audience: this.env.APPLE_BUNDLE_ID,
    });
    if (!payload || typeof payload.sub !== 'string') return null;
    return {
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: asBoolean(payload.email_verified),
      isPrivateRelay: asBoolean(payload.is_private_email),
      givenName: null,
    };
  }

  /** Server-to-server notification: `events` is a JSON string with `type` and `sub` (research R8, to verify in T071). */
  async verifyNotification(
    payload: string,
  ): Promise<{ type: AppleNotificationType; subject: string } | null> {
    this.keys ??= remoteJwks(APPLE_JWKS_URL);
    const claims = await verifyWithJwks(payload, this.keys, {
      issuer: APPLE_ISSUER,
      audience: this.env.APPLE_BUNDLE_ID,
    });
    if (!claims || typeof claims.events !== 'string') return null;
    try {
      const events = JSON.parse(claims.events) as {
        type?: string;
        sub?: string;
      };
      const types: AppleNotificationType[] = [
        'email-disabled',
        'email-enabled',
        'consent-revoked',
        'account-delete',
      ];
      if (!events.sub || !types.includes(events.type as AppleNotificationType))
        return null;
      return {
        type: events.type as AppleNotificationType,
        subject: events.sub,
      };
    } catch {
      return null;
    }
  }
}
