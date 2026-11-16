import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import type { PasswordHasher } from '../../application/ports/security';
import type { PlainPassword } from '../../domain/value-objects/plain-password';

/** OWASP argon2id parameters (research R4): 19 MiB, 2 iterations, parallelism 1. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class Argon2PasswordHasher implements PasswordHasher {
  private dummyHash: Promise<string> | null = null;

  hash(password: PlainPassword): Promise<string> {
    return argon2.hash(password.reveal(), ARGON2_OPTIONS);
  }

  async verify(hash: string, password: PlainPassword): Promise<boolean> {
    try {
      return await argon2.verify(hash, password.reveal());
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, ARGON2_OPTIONS);
  }

  async verifyDummy(password: PlainPassword): Promise<void> {
    this.dummyHash ??= argon2.hash('dummy password for timing', ARGON2_OPTIONS);
    await argon2.verify(await this.dummyHash, password.reveal());
  }
}
