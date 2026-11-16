import { Inject, Injectable } from '@nestjs/common';
import type { JWTVerifyGetKey } from 'jose';
import {
  ENV,
  type Env,
} from '../../../shared-kernel/infrastructure/config/env';
import type {
  ProviderClaims,
  ProviderIdentityVerifier,
} from '../../application/ports/providers';
import { asBoolean, remoteJwks, verifyWithJwks } from './jwks-verifier';

export const GOOGLE_ISSUERS = [
  'accounts.google.com',
  'https://accounts.google.com',
];
export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';

@Injectable()
export class GoogleIdentityVerifier implements ProviderIdentityVerifier {
  private keys: JWTVerifyGetKey | null = null;

  constructor(
    @Inject(ENV) private readonly env: Pick<Env, 'GOOGLE_WEB_CLIENT_ID'>,
  ) {}

  useKeys(keys: JWTVerifyGetKey): void {
    this.keys = keys;
  }

  async verify(token: string): Promise<ProviderClaims | null> {
    this.keys ??= remoteJwks(GOOGLE_JWKS_URL);
    const payload = await verifyWithJwks(token, this.keys, {
      issuer: GOOGLE_ISSUERS,
      audience: this.env.GOOGLE_WEB_CLIENT_ID,
    });
    if (!payload || typeof payload.sub !== 'string') return null;
    return {
      subject: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      emailVerified: asBoolean(payload.email_verified),
      isPrivateRelay: false,
      givenName:
        typeof payload.given_name === 'string' ? payload.given_name : null,
    };
  }
}
