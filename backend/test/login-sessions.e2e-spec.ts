import { sql } from 'drizzle-orm';
import { createE2eApp, device, type E2eApp } from './support/e2e-app';
import { fakeProviders } from './support/fake-providers';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

const password = 'un mot de passe solide';
const signUp = () =>
  e2e.client().post('/v1/auth/signup').send({
    email: 'user@example.com',
    password,
    firstName: 'Fabien',
    locale: 'fr',
    device,
  });
const login = (email: string, pw: string, ip?: string) =>
  e2e.client(ip).post('/v1/auth/login').send({ email, password: pw, device });
const me = (accessToken: string) =>
  e2e.client().get('/v1/me').set('Authorization', `Bearer ${accessToken}`);

describe('Login, refresh, logout (US2)', () => {
  it('logs in with any email case and surrounding spaces', async () => {
    await signUp();
    const res = await login('  USER@example.com ', password);
    expect(res.status).toBe(200);
    expect(res.body.me.email).toBe('user@example.com');
    const profile = await me(res.body.tokens.accessToken);
    expect(profile.status).toBe(200);
    expect(profile.body.firstName).toBe('Fabien');
  });

  it('gives the same answer for a wrong email and a wrong password', async () => {
    await signUp();
    const wrongEmail = await login('nobody@example.com', password);
    const wrongPassword = await login(
      'user@example.com',
      'mauvais mot de passe',
    );
    expect(wrongEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(wrongEmail.body).toEqual({ error: 'INVALID_CREDENTIALS' });
    expect(wrongPassword.body).toEqual(wrongEmail.body);
  });

  it('locks the account for 15 minutes at the 5th failure, even with the right password', async () => {
    await signUp();
    for (let i = 0; i < 4; i += 1)
      expect(
        (await login('user@example.com', 'wrong wrong wrong', `10.1.1.${i}`))
          .status,
      ).toBe(401);
    const fifth = await login(
      'user@example.com',
      'wrong wrong wrong',
      '10.1.1.9',
    );
    expect(fifth.status).toBe(401);
    const locked = await login('user@example.com', password, '10.1.2.1');
    expect(locked.status).toBe(423);
    expect(locked.body.error).toBe('ACCOUNT_LOCKED');
    expect(locked.body.retryAfterSeconds).toBeGreaterThan(890);
    expect(locked.body.retryAfterSeconds).toBeLessThanOrEqual(900);
    await new Promise((r) => setTimeout(r, 50));
    e2e.mailbox.assertSent({ to: 'user@example.com', subject: /bloquée/ });
  });

  it('resets the failure count after a successful login', async () => {
    await signUp();
    for (let i = 0; i < 4; i += 1)
      await login('user@example.com', 'wrong wrong wrong', `10.2.1.${i}`);
    expect((await login('user@example.com', password)).status).toBe(200);
    expect((await login('user@example.com', 'wrong wrong wrong')).status).toBe(
      401,
    );
    expect((await login('user@example.com', password)).status).toBe(200);
  });

  it('rotates refresh tokens and revokes the session when an old one is reused', async () => {
    const { body } = await signUp();
    const first = await e2e
      .client()
      .post('/v1/auth/refresh')
      .send({ refreshToken: body.tokens.refreshToken });
    expect(first.status).toBe(200);
    expect(first.body.tokens.refreshToken).not.toBe(body.tokens.refreshToken);
    const reuse = await e2e
      .client()
      .post('/v1/auth/refresh')
      .send({ refreshToken: body.tokens.refreshToken });
    expect(reuse.status).toBe(401);
    expect(reuse.body).toEqual({
      error: 'SESSION_ENDED',
      reason: 'reuse_detected',
    });
    const afterReuse = await e2e
      .client()
      .post('/v1/auth/refresh')
      .send({ refreshToken: first.body.tokens.refreshToken });
    expect(afterReuse.status).toBe(401);
  });

  it('expires a session unused for more than 90 days', async () => {
    const { body } = await signUp();
    await e2e.db.execute(
      sql`UPDATE sessions SET last_used_at = now() - interval '90 days 1 minute'`,
    );
    const res = await e2e
      .client()
      .post('/v1/auth/refresh')
      .send({ refreshToken: body.tokens.refreshToken });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'SESSION_ENDED', reason: 'expired' });
    expect((await me(body.tokens.accessToken)).body).toEqual({
      error: 'SESSION_ENDED',
      reason: 'expired',
    });
  });

  it('logs out server-side and leaves other devices signed in', async () => {
    const phone = (await signUp()).body;
    const tablet = (await login('user@example.com', password)).body;
    const out = await e2e
      .client()
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${phone.tokens.accessToken}`);
    expect(out.status).toBe(204);
    expect((await me(phone.tokens.accessToken)).body).toEqual({
      error: 'SESSION_ENDED',
      reason: 'logout',
    });
    expect(
      (
        await e2e
          .client()
          .post('/v1/auth/refresh')
          .send({ refreshToken: phone.tokens.refreshToken })
      ).status,
    ).toBe(401);
    expect((await me(tablet.tokens.accessToken)).status).toBe(200);
  });

  it('refuses /me without a token', async () => {
    const res = await e2e.client().get('/v1/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'UNAUTHENTICATED' });
  });
});
