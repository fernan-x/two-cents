import { sql } from 'drizzle-orm';
import { createE2eApp, device, type E2eApp } from './support/e2e-app';
import {
  appleToken,
  fakeProviders,
  googleToken,
} from './support/fake-providers';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

const password = 'un mot de passe solide';
const reauth = (
  accessToken: string,
  body: Record<string, unknown>,
  ip?: string,
) =>
  e2e
    .client(ip)
    .post('/v1/auth/reauthenticate')
    .set('Authorization', `Bearer ${accessToken}`)
    .send(body);

describe('Re-authentication (US5)', () => {
  it('returns a 5-minute token for the right password', async () => {
    const { body } = await e2e.client().post('/v1/auth/signup').send({
      email: 'u@example.com',
      password,
      firstName: 'U',
      locale: 'fr',
      device,
    });
    const res = await reauth(body.tokens.accessToken, { password });
    expect(res.status).toBe(200);
    const expiresIn = new Date(res.body.expiresAt).getTime() - Date.now();
    expect(expiresIn).toBeGreaterThan(4 * 60_000);
    expect(expiresIn).toBeLessThanOrEqual(5 * 60_000);
    const stored = await e2e.db.execute<{ reauth_token_hash: string }>(
      sql`SELECT reauth_token_hash FROM sessions`,
    );
    expect(stored.rows[0].reauth_token_hash).not.toBe(res.body.reauthToken);
  });

  it('counts wrong passwords toward the lockout', async () => {
    const { body } = await e2e.client().post('/v1/auth/signup').send({
      email: 'u@example.com',
      password,
      firstName: 'U',
      locale: 'fr',
      device,
    });
    for (let i = 0; i < 5; i += 1)
      expect(
        (
          await reauth(
            body.tokens.accessToken,
            { password: 'wrong wrong wrong' },
            `10.5.5.${i}`,
          )
        ).status,
      ).toBe(401);
    expect(
      (await reauth(body.tokens.accessToken, { password }, '10.5.6.1')).status,
    ).toBe(423);
  });

  it('accepts the same provider identity and refuses another one', async () => {
    const { body } = await e2e
      .client()
      .post('/v1/auth/google')
      .send({
        idToken: googleToken('g-1', 'g@example.com'),
        locale: 'fr',
        device,
      });
    expect(
      (
        await reauth(body.tokens.accessToken, {
          provider: 'google',
          idToken: googleToken('g-1', 'g@example.com'),
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await reauth(body.tokens.accessToken, {
          provider: 'google',
          idToken: googleToken('g-2', 'x@example.com'),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await reauth(body.tokens.accessToken, {
          provider: 'apple',
          identityToken: appleToken('g-1', null),
        })
      ).status,
    ).toBe(401);
  });
});
