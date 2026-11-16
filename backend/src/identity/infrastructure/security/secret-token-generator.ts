import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { SecretTokenGenerator } from '../../application/ports/security';

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

/** 256-bit random tokens; only the SHA-256 hash is stored (research R5/R6). */
@Injectable()
export class CryptoSecretTokenGenerator implements SecretTokenGenerator {
  generate(): { token: string; hash: string } {
    const token = randomBytes(32).toString('base64url');
    return { token, hash: hashToken(token) };
  }

  hash(token: string): string {
    return hashToken(token);
  }
}
