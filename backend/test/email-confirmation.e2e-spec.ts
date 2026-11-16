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
const signUp = () =>
  e2e.client().post('/v1/auth/signup').send({
    email: 'u@example.com',
    password: 'un mot de passe solide',
    firstName: 'U',
    locale: 'fr',
    device,
  });
const tokenFromLastMail = () => {
  const mail = e2e.mailbox.filter({ to: 'u@example.com' }).at(-1)!;
  return mail.link(/\/l\/confirm\?t=/).searchParams.get('t')!;
};

describe('Email confirmation (US3)', () => {
  it('sends a confirmation link at sign-up that works once', async () => {
    const { body } = await signUp();
    await flush();
    const token = tokenFromLastMail();
    const res = await e2e
      .client()
      .post('/v1/auth/email/confirm')
      .send({ token });
    expect(res.status).toBe(200);
    const me = await e2e
      .client()
      .get('/v1/me')
      .set('Authorization', `Bearer ${body.tokens.accessToken}`);
    expect(me.body.emailConfirmed).toBe(true);
    const again = await e2e
      .client()
      .post('/v1/auth/email/confirm')
      .send({ token });
    expect(again.status).toBe(410);
    expect(again.body.error).toBe('TOKEN_INVALID');
  });

  it('refuses a link older than 24 hours', async () => {
    await signUp();
    await flush();
    await e2e.db.execute(
      sql`UPDATE email_tokens SET expires_at = now() - interval '1 second'`,
    );
    const res = await e2e
      .client()
      .post('/v1/auth/email/confirm')
      .send({ token: tokenFromLastMail() });
    expect(res.status).toBe(410);
  });

  it('resend supersedes the previous link', async () => {
    const { body } = await signUp();
    await flush();
    const first = tokenFromLastMail();
    const resend = await e2e
      .client()
      .post('/v1/auth/email/resend-confirmation')
      .set('Authorization', `Bearer ${body.tokens.accessToken}`);
    expect(resend.status).toBe(202);
    await flush();
    const second = tokenFromLastMail();
    expect(second).not.toBe(first);
    expect(
      (await e2e.client().post('/v1/auth/email/confirm').send({ token: first }))
        .status,
    ).toBe(410);
    expect(
      (
        await e2e
          .client()
          .post('/v1/auth/email/confirm')
          .send({ token: second })
      ).status,
    ).toBe(200);
    const already = await e2e
      .client()
      .post('/v1/auth/email/resend-confirmation')
      .set('Authorization', `Bearer ${body.tokens.accessToken}`);
    expect(already.status).toBe(409);
    expect(already.body.error).toBe('ALREADY_CONFIRMED');
  });

  it('rate-limits resends', async () => {
    const { body } = await signUp();
    const client = e2e.client('10.77.0.1');
    let last = 0;
    for (let i = 0; i < 4; i += 1) {
      last = (
        await client
          .post('/v1/auth/email/resend-confirmation')
          .set('Authorization', `Bearer ${body.tokens.accessToken}`)
      ).status;
    }
    expect(last).toBe(429);
  });

  it('treats Apple accounts as confirmed', async () => {
    const res = await e2e
      .client()
      .post('/v1/auth/apple')
      .send({
        identityToken: appleToken('a1', 'a@example.com'),
        locale: 'fr',
        device,
      });
    expect(res.body.me.emailConfirmed).toBe(true);
  });
});
