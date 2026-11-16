import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { AppleIdentityVerifier } from './apple-identity-verifier';
import { GoogleIdentityVerifier } from './google-identity-verifier';

async function keys() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  return { privateKey, jwks: createLocalJWKSet({ keys: [jwk] }) };
}

const sign = (
  privateKey: CryptoKey,
  claims: Record<string, unknown>,
  iss: string,
  aud: string,
  exp = '10m',
) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(iss)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(privateKey);

describe('AppleIdentityVerifier', () => {
  it('accepts a valid token and normalizes string booleans', async () => {
    const { privateKey, jwks } = await keys();
    const verifier = new AppleIdentityVerifier({
      APPLE_BUNDLE_ID: 'app.twocents.test',
    });
    verifier.useKeys(jwks);
    const token = await sign(
      privateKey,
      {
        sub: 'apple-1',
        email: 'x@privaterelay.appleid.com',
        email_verified: 'true',
        is_private_email: 'true',
      },
      'https://appleid.apple.com',
      'app.twocents.test',
    );
    expect(await verifier.verify(token)).toEqual({
      subject: 'apple-1',
      email: 'x@privaterelay.appleid.com',
      emailVerified: true,
      isPrivateRelay: true,
      givenName: null,
    });
  });

  it('rejects the wrong audience, issuer or an expired token', async () => {
    const { privateKey, jwks } = await keys();
    const verifier = new AppleIdentityVerifier({
      APPLE_BUNDLE_ID: 'app.twocents.test',
    });
    verifier.useKeys(jwks);
    expect(
      await verifier.verify(
        await sign(
          privateKey,
          { sub: 'a' },
          'https://appleid.apple.com',
          'other.app',
        ),
      ),
    ).toBeNull();
    expect(
      await verifier.verify(
        await sign(
          privateKey,
          { sub: 'a' },
          'https://evil.example',
          'app.twocents.test',
        ),
      ),
    ).toBeNull();
    expect(
      await verifier.verify(
        await sign(
          privateKey,
          { sub: 'a' },
          'https://appleid.apple.com',
          'app.twocents.test',
          '-1m',
        ),
      ),
    ).toBeNull();
  });
});

describe('GoogleIdentityVerifier', () => {
  it('accepts both Google issuers and returns the given name', async () => {
    const { privateKey, jwks } = await keys();
    const verifier = new GoogleIdentityVerifier({
      GOOGLE_WEB_CLIENT_ID: 'web.apps.googleusercontent.com',
    });
    verifier.useKeys(jwks);
    for (const iss of ['accounts.google.com', 'https://accounts.google.com']) {
      const token = await sign(
        privateKey,
        {
          sub: 'g-1',
          email: 'f@gmail.com',
          email_verified: true,
          given_name: 'Fabien',
        },
        iss,
        'web.apps.googleusercontent.com',
      );
      expect(await verifier.verify(token)).toMatchObject({
        subject: 'g-1',
        emailVerified: true,
        givenName: 'Fabien',
      });
    }
  });
});
