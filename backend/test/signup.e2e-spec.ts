import { sql } from 'drizzle-orm';
import { createE2eApp, device, type E2eApp } from './support/e2e-app';
import { fakeProviders } from './support/fake-providers';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

const signUp = (body: Record<string, unknown>, ip?: string) =>
  e2e
    .client(ip)
    .post('/v1/auth/signup')
    .send({ locale: 'fr', device, ...body });

describe('POST /v1/auth/signup (US1)', () => {
  it('creates an unconfirmed account and signs in', async () => {
    const res = await signUp({
      email: 'Maelle@Example.com',
      password: 'un mot de passe solide',
      firstName: 'Maëlle',
    });
    expect(res.status).toBe(201);
    expect(res.body.tokens.accessToken).toEqual(expect.any(String));
    expect(res.body.tokens.refreshToken).toEqual(expect.any(String));
    expect(res.body.me).toMatchObject({
      email: 'Maelle@Example.com',
      emailConfirmed: false,
      firstName: 'Maëlle',
      signInMethods: ['password'],
      hasBudget: false,
      status: 'active',
    });
  });

  it('stores the first name in NFC', async () => {
    await signUp({
      email: 'a@b.fr',
      password: 'un mot de passe solide',
      firstName: 'Maëlle',
    });
    const rows = await e2e.db.execute<{ first_name: string }>(
      sql`SELECT first_name FROM users`,
    );
    expect(rows.rows[0].first_name).toBe('Maëlle');
    expect(rows.rows[0].first_name).toBe(
      rows.rows[0].first_name.normalize('NFC'),
    );
  });

  it('refuses an email already in use, whatever the case', async () => {
    await signUp({
      email: 'maelle@example.com',
      password: 'un mot de passe solide',
      firstName: 'Maëlle',
    });
    const res = await signUp({
      email: 'Maelle@Example.com',
      password: 'un autre mot de passe',
      firstName: 'M',
    });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'EMAIL_IN_USE' });
  });

  it('refuses short and breached passwords without creating anything', async () => {
    const short = await signUp({
      email: 'a@b.fr',
      password: '123456789',
      firstName: 'A',
    });
    expect(short.status).toBe(422);
    expect(short.body.error).toBe('PASSWORD_TOO_SHORT');
    const breached = await signUp({
      email: 'a@b.fr',
      password: 'motdepasse1',
      firstName: 'A',
    });
    expect(breached.status).toBe(422);
    expect(breached.body.error).toBe('PASSWORD_BREACHED');
    const count = await e2e.db.execute<{ n: string }>(
      sql`SELECT count(*)::text AS n FROM users`,
    );
    expect(count.rows[0].n).toBe('0');
  });

  it('validates input with the shared contract', async () => {
    const res = await signUp({
      email: 'not-an-email',
      password: 'un mot de passe solide',
      firstName: '',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
  });

  it('rate-limits sign-up per IP (11th request in a minute)', async () => {
    const ip = '10.99.99.99';
    for (let i = 0; i < 10; i += 1) {
      await signUp(
        { email: `user${i}@b.fr`, password: '123', firstName: 'A' },
        ip,
      );
    }
    const res = await signUp(
      {
        email: 'last@b.fr',
        password: 'un mot de passe solide',
        firstName: 'A',
      },
      ip,
    );
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('RATE_LIMITED');
  });

  it('never stores the password or refresh token in plain text', async () => {
    const res = await signUp({
      email: 'a@b.fr',
      password: 'un mot de passe solide',
      firstName: 'A',
    });
    const users = await e2e.db.execute<{ password_hash: string }>(
      sql`SELECT password_hash FROM users`,
    );
    expect(users.rows[0].password_hash.startsWith('$argon2id$')).toBe(true);
    const sessions = await e2e.db.execute<{ refresh_token_hash: string }>(
      sql`SELECT refresh_token_hash FROM sessions`,
    );
    expect(sessions.rows[0].refresh_token_hash).not.toBe(
      res.body.tokens.refreshToken,
    );
  });
});
