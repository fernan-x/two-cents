import type { PlainPassword } from '../../domain/value-objects/plain-password';

export interface PasswordHasher {
  hash(password: PlainPassword): Promise<string>;
  verify(hash: string, password: PlainPassword): Promise<boolean>;
  needsRehash(hash: string): boolean;
  /** Spends the same time as a real verification, for unknown emails (no timing leak, FR-006). */
  verifyDummy(password: PlainPassword): Promise<void>;
}
export const PASSWORD_HASHER = Symbol('PasswordHasher');

export interface SecretTokenGenerator {
  /** 256-bit random token (sent to the user) and its SHA-256 hash (stored). */
  generate(): { token: string; hash: string };
  hash(token: string): string;
}
export const SECRET_TOKEN_GENERATOR = Symbol('SecretTokenGenerator');

export interface AccessTokenIssuer {
  issue(
    userId: string,
    sessionId: string,
  ): Promise<{ token: string; expiresAt: Date }>;
  /** Returns the claims, or null when the token is invalid or expired. */
  verify(token: string): Promise<{ userId: string; sessionId: string } | null>;
}
export const ACCESS_TOKEN_ISSUER = Symbol('AccessTokenIssuer');

export interface BreachedPasswordChecker {
  /** True when the password is common or appears in known breaches. */
  isBreached(password: PlainPassword): Promise<boolean>;
}
export const BREACHED_PASSWORD_CHECKER = Symbol('BreachedPasswordChecker');

export interface SecretEncryptor {
  encrypt(plaintext: string): Buffer;
  decrypt(ciphertext: Buffer): string;
}
export const SECRET_ENCRYPTOR = Symbol('SecretEncryptor');
