import { sql } from 'drizzle-orm';
import { createE2eApp, device, type E2eApp } from './support/e2e-app';
import { appleToken, fakeProviders } from './support/fake-providers';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

const flush = () => new Promise((r) => setTimeout(r, 50));
const oldPassword = 'un mot de passe solide';
const newPassword = 'un tout nouveau mot de passe';
const signUp = () =>
  e2e.client().post('/v1/auth/signup').send({
    email: 'u@example.com',
    password: oldPassword,
    firstName: 'U',
    locale: 'fr',
    device,
  });
const forgot = (email: string) =>
  e2e.client().post('/v1/auth/password/forgot').send({ email, locale: 'fr' });
const resetToken = () =>
  e2e.mailbox
    .filter({ to: 'u@example.com', subject: /Réinitialisez/ })
    .at(-1)!
    .link(/\/l\/reset\?t=/)
    .searchParams.get('t')!;
const reset = (token: string, password = newPassword) =>
  e2e
    .client()
    .post('/v1/auth/password/reset')
    .send({ token, newPassword: password });
const login = (password: string) =>
  e2e
    .client()
    .post('/v1/auth/login')
    .send({ email: 'u@example.com', password, device });

describe('Password reset (US4)', () => {
  it('answers the same for known and unknown emails, and only mails the known one', async () => {
    await signUp();
    const known = await forgot('U@example.com');
    const unknown = await forgot('ghost@example.com');
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    await flush();
    expect(e2e.mailbox.filter({ subject: /Réinitialisez/ })).toHaveLength(1);
  });

  it('resets once, signs out every session, lifts the lockout and notifies', async () => {
    const { body } = await signUp();
    for (let i = 0; i < 5; i += 1)
      await e2e.client(`10.3.3.${i}`).post('/v1/auth/login').send({
        email: 'u@example.com',
        password: 'wrong wrong wrong',
        device,
      });
    expect((await login(oldPassword)).status).toBe(423);
    await forgot('u@example.com');
    await flush();
    const token = resetToken();
    expect((await reset(token)).status).toBe(204);
    expect((await login(oldPassword)).status).toBe(401);
    expect((await login(newPassword)).status).toBe(200);
    const me = await e2e
      .client()
      .get('/v1/me')
      .set('Authorization', `Bearer ${body.tokens.accessToken}`);
    expect(me.body).toEqual({
      error: 'SESSION_ENDED',
      reason: 'password_changed',
    });
    expect((await reset(token)).status).toBe(410);
    await flush();
    e2e.mailbox.assertSent({ to: 'u@example.com', subject: /modifié/ });
  });

  it('refuses links older than 1 hour and links replaced by a newer request', async () => {
    await signUp();
    await forgot('u@example.com');
    await flush();
    const first = resetToken();
    await forgot('u@example.com');
    await flush();
    const second = resetToken();
    expect((await reset(first)).status).toBe(410);
    await e2e.db.execute(
      sql`UPDATE email_tokens SET expires_at = now() - interval '1 second' WHERE purpose = 'reset_password'`,
    );
    expect((await reset(second)).status).toBe(410);
  });

  it('applies the password policy', async () => {
    await signUp();
    await forgot('u@example.com');
    await flush();
    const res = await reset(resetToken(), 'short');
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('PASSWORD_TOO_SHORT');
  });

  it('adds a password to an Apple-only account', async () => {
    const apple = await e2e
      .client()
      .post('/v1/auth/apple')
      .send({
        identityToken: appleToken('a1', 'u@example.com'),
        locale: 'fr',
        device,
      });
    expect(apple.body.me.signInMethods).toEqual(['apple']);
    await forgot('u@example.com');
    await flush();
    expect((await reset(resetToken())).status).toBe(204);
    const res = await login(newPassword);
    expect(res.status).toBe(200);
    expect(res.body.me.signInMethods).toEqual(['password', 'apple']);
  });
});
