import { Writable } from 'node:stream';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { REDACTED_PATHS } from '../src/shared-kernel/infrastructure/logging/logger.module';
import { createE2eApp, device, type E2eApp } from './support/e2e-app';
import { appleToken, fakeProviders } from './support/fake-providers';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

const flush = () => new Promise((r) => setTimeout(r, 50));
const password = 'un mot de passe solide';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Privacy (SC-002, Principle III)', () => {
  it('stores no password, access, refresh, link or re-auth token in plain text', async () => {
    const secrets: string[] = [password];
    const signUp = await e2e.client().post('/v1/auth/signup').send({
      email: 'u@example.com',
      password,
      firstName: 'U',
      locale: 'fr',
      device,
    });
    secrets.push(
      signUp.body.tokens.accessToken,
      signUp.body.tokens.refreshToken,
    );
    const refreshed = await e2e
      .client()
      .post('/v1/auth/refresh')
      .send({ refreshToken: signUp.body.tokens.refreshToken });
    secrets.push(
      refreshed.body.tokens.accessToken,
      refreshed.body.tokens.refreshToken,
    );
    const reauth = await e2e
      .client()
      .post('/v1/auth/reauthenticate')
      .set(auth(refreshed.body.tokens.accessToken))
      .send({ password });
    secrets.push(reauth.body.reauthToken);
    await e2e
      .client()
      .post('/v1/auth/password/forgot')
      .send({ email: 'u@example.com', locale: 'fr' });
    const apple = await e2e
      .client()
      .post('/v1/auth/apple')
      .send({
        identityToken: appleToken('a1', 'x@example.com'),
        authorizationCode: 'code-x',
        locale: 'fr',
        device,
      });
    secrets.push(apple.body.tokens.refreshToken, 'apple-refresh-for-code-x');
    const google = await e2e
      .client()
      .post('/v1/auth/google')
      .send({ idToken: 'valid:g1|u@example.com||U', locale: 'fr', device });
    secrets.push(google.body.linkToken);
    await flush();
    for (const mail of e2e.mailbox.mails)
      for (const link of mail.links) {
        const t = new URL(link).searchParams.get('t');
        if (t) secrets.push(t);
      }
    expect(secrets.filter(Boolean).length).toBeGreaterThan(8);

    const tables = await e2e.db.execute<{ tablename: string }>(
      sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    );
    for (const { tablename } of tables.rows) {
      const rows = await e2e.db.execute(
        sql.raw(`SELECT * FROM "${tablename}"`),
      );
      const dump = JSON.stringify(rows.rows, (_k, v: unknown) =>
        Buffer.isBuffer(v) ? v.toString('latin1') : v,
      );
      for (const secret of secrets.filter(Boolean))
        expect({ table: tablename, leaked: dump.includes(secret) }).toEqual({
          table: tablename,
          leaked: false,
        });
    }
  });

  it('never shows one user another user’s account data', async () => {
    const a = (
      await e2e.client().post('/v1/auth/signup').send({
        email: 'a@example.com',
        password,
        firstName: 'Alice',
        locale: 'fr',
        device,
      })
    ).body;
    const b = (
      await e2e.client().post('/v1/auth/signup').send({
        email: 'b@example.com',
        password,
        firstName: 'Bob',
        locale: 'fr',
        device,
      })
    ).body;
    const sessionsOfA = (
      await e2e.client().get('/v1/me/sessions').set(auth(a.tokens.accessToken))
    ).body.sessions;
    const meAsB = await e2e
      .client()
      .get('/v1/me')
      .set(auth(b.tokens.accessToken));
    expect(meAsB.body.email).toBe('b@example.com');
    expect(
      (
        await e2e
          .client()
          .delete(`/v1/me/sessions/${sessionsOfA[0].id}`)
          .set(auth(b.tokens.accessToken))
      ).status,
    ).toBe(404);
    const sessionsAsB = (
      await e2e.client().get('/v1/me/sessions').set(auth(b.tokens.accessToken))
    ).body.sessions;
    expect(sessionsAsB.map((s: { id: string }) => s.id)).not.toContain(
      sessionsOfA[0].id,
    );
  });

  it('redacts credentials and emails from logs', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write: (chunk, _enc, done) => (lines.push(String(chunk)), done()),
    });
    const logger = pino(
      { redact: { paths: REDACTED_PATHS, censor: '[redacted]' } },
      stream,
    );
    logger.info({
      req: { headers: { authorization: 'Bearer secret-access' } },
      body: {
        password: 'hunter2hunter2',
        email: 'u@example.com',
        refreshToken: 'r1',
      },
    });
    const output = lines.join('');
    for (const secret of [
      'secret-access',
      'hunter2hunter2',
      'u@example.com',
      'r1"',
    ])
      expect(output).not.toContain(secret);
  });
});
