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

const apple = (identityToken: string, firstName?: string) =>
  e2e.client().post('/v1/auth/apple').send({
    identityToken,
    authorizationCode: 'code-1',
    firstName,
    locale: 'fr',
    device,
  });
const google = (idToken: string) =>
  e2e.client().post('/v1/auth/google').send({ idToken, locale: 'fr', device });
const signUp = (email: string) =>
  e2e.client().post('/v1/auth/signup').send({
    email,
    password: 'un mot de passe solide',
    firstName: 'Fabien',
    locale: 'fr',
    device,
  });

describe('Sign in with Apple / Google (US1)', () => {
  it('creates a confirmed account with an Apple relay email', async () => {
    const res = await apple(
      appleToken('apple-sub-1', 'x7k2@privaterelay.appleid.com', true),
      'Maëlle',
    );
    expect(res.status).toBe(201);
    expect(res.body.me).toMatchObject({
      email: 'x7k2@privaterelay.appleid.com',
      emailConfirmed: true,
      firstName: 'Maëlle',
      signInMethods: ['apple'],
    });
    const rows = await e2e.db.execute<{
      is_private_relay: boolean;
      apple_refresh_token_enc: Buffer;
    }>(
      sql`SELECT is_private_relay, apple_refresh_token_enc FROM auth_identities`,
    );
    expect(rows.rows[0].is_private_relay).toBe(true);
    expect(rows.rows[0].apple_refresh_token_enc.toString()).not.toContain(
      'apple-refresh-for-code-1',
    );
  });

  it('finds the same user by Apple sub when the email is not sent again', async () => {
    const first = await apple(
      appleToken('apple-sub-1', 'm@example.com'),
      'Maëlle',
    );
    const second = await apple(appleToken('apple-sub-1', null));
    expect(second.status).toBe(200);
    expect(second.body.me.id).toBe(first.body.me.id);
  });

  it('requires proof before linking Google to an existing password account', async () => {
    await signUp('fabien@example.com');
    const res = await google(googleToken('google-sub-1', 'Fabien@example.com'));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'LINK_REQUIRED',
      linkToken: expect.any(String),
      emailHint: 'f•••@example.com',
    });
    const identities = await e2e.db.execute(sql`SELECT * FROM auth_identities`);
    expect(identities.rows).toHaveLength(0);
  });

  it('links with the account password', async () => {
    const created = await signUp('fabien@example.com');
    const { linkToken } = (
      await google(googleToken('google-sub-1', 'fabien@example.com'))
    ).body;
    const wrong = await e2e
      .client()
      .post('/v1/auth/link/password')
      .send({ linkToken, password: 'mauvais mot de passe', device });
    expect(wrong.status).toBe(401);
    const res = await e2e
      .client()
      .post('/v1/auth/link/password')
      .send({ linkToken, password: 'un mot de passe solide', device });
    expect(res.status).toBe(200);
    expect(res.body.me.id).toBe(created.body.me.id);
    expect(res.body.me.signInMethods).toEqual(['password', 'google']);
    const again = await google(
      googleToken('google-sub-1', 'fabien@example.com'),
    );
    expect(again.status).toBe(200);
    expect(again.body.me.id).toBe(created.body.me.id);
  });

  it('links through an emailed link', async () => {
    await signUp('fabien@example.com');
    const { linkToken } = (
      await google(googleToken('google-sub-1', 'fabien@example.com'))
    ).body;
    const sent = await e2e
      .client()
      .post('/v1/auth/link/email')
      .send({ linkToken });
    expect(sent.status).toBe(202);
    await new Promise((r) => setTimeout(r, 50));
    const mail = e2e.mailbox.assertSent({ to: 'fabien@example.com' });
    const token = mail.link(/\/l\/link\?t=/).searchParams.get('t');
    const res = await e2e
      .client()
      .post('/v1/auth/link/confirm')
      .send({ token, device });
    expect(res.status).toBe(200);
    expect(res.body.me.signInMethods).toEqual(['password', 'google']);
    const reuse = await e2e
      .client()
      .post('/v1/auth/link/confirm')
      .send({ token, device });
    expect(reuse.status).toBe(410);
  });

  it('rejects an unknown link token and an invalid provider token', async () => {
    const link = await e2e
      .client()
      .post('/v1/auth/link/password')
      .send({ linkToken: 'nope', password: 'whatever whatever', device });
    expect(link.status).toBe(410);
    expect(link.body.error).toBe('LINK_EXPIRED');
    const bad = await google('forged-token');
    expect(bad.status).toBe(401);
    expect(bad.body.error).toBe('INVALID_PROVIDER_TOKEN');
  });

  it('ends Apple sessions when Apple reports revoked consent', async () => {
    const res = await apple(appleToken('apple-sub-9', 'r@example.com'), 'R');
    const token = res.body.tokens.accessToken as string;
    const notify = await e2e
      .client()
      .post('/v1/auth/apple/notifications')
      .send({ payload: 'notif|consent-revoked|apple-sub-9' });
    expect(notify.status).toBe(200);
    const after = await e2e
      .client()
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}`);
    expect([401, 404]).toContain(after.status);
    const identities = await e2e.db.execute(sql`SELECT * FROM auth_identities`);
    expect(identities.rows).toHaveLength(0);
    const sessions = await e2e.db.execute<{ revoked_reason: string }>(
      sql`SELECT revoked_reason FROM sessions`,
    );
    expect(sessions.rows[0].revoked_reason).toBe('provider_revoked');
  });
});
