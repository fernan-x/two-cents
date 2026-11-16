import { PlainPassword } from '../../domain/value-objects/plain-password';
import { Argon2PasswordHasher } from './argon2-password-hasher';
import { JoseAccessTokenIssuer } from './jose-access-token-issuer';
import {
  CryptoSecretTokenGenerator,
  hashToken,
} from './secret-token-generator';

describe('Argon2PasswordHasher', () => {
  const hasher = new Argon2PasswordHasher();

  it('hashes with argon2id and verifies', async () => {
    const hash = await hasher.hash(
      PlainPassword.create('correct horse battery'),
    );
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(
      await hasher.verify(
        hash,
        PlainPassword.forVerification('correct horse battery'),
      ),
    ).toBe(true);
    expect(
      await hasher.verify(
        hash,
        PlainPassword.forVerification('wrong password!!'),
      ),
    ).toBe(false);
    expect(hasher.needsRehash(hash)).toBe(false);
  });

  it('returns false for a malformed hash', async () => {
    expect(
      await hasher.verify(
        'not-a-hash',
        PlainPassword.forVerification('anything at all'),
      ),
    ).toBe(false);
  });
});

describe('CryptoSecretTokenGenerator', () => {
  it('returns a 256-bit token and its SHA-256 hash', () => {
    const { token, hash } = new CryptoSecretTokenGenerator().generate();
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(hash).toBe(hashToken(token));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('JoseAccessTokenIssuer', () => {
  const env = { JWT_SECRET: Buffer.alloc(32, 1).toString('base64') } as never;
  let now = new Date('2026-11-16T10:00:00Z');
  const issuer = new JoseAccessTokenIssuer(env, { now: () => now });

  it('issues a 15-minute token that verifies', async () => {
    const { token, expiresAt } = await issuer.issue('user-1', 'session-1');
    expect(expiresAt).toEqual(new Date('2026-11-16T10:15:00Z'));
    expect(await issuer.verify(token)).toEqual({
      userId: 'user-1',
      sessionId: 'session-1',
    });
  });

  it('rejects expired and tampered tokens', async () => {
    const { token } = await issuer.issue('user-1', 'session-1');
    expect(await issuer.verify(token.slice(0, -2) + 'xx')).toBeNull();
    now = new Date('2026-11-16T10:16:00Z');
    expect(await issuer.verify(token)).toBeNull();
  });
});
