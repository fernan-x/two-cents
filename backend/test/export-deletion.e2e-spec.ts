import { sql } from 'drizzle-orm';
import { strFromU8, unzipSync } from 'fflate';
import { FinalizeDeletionsJob } from '../src/identity/infrastructure/jobs/finalize-deletions.job';
import { createE2eApp, device, type E2eApp } from './support/e2e-app';
import { appleToken, fakeProviders } from './support/fake-providers';

const providers = fakeProviders();
let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(providers.overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

const flush = () => new Promise((r) => setTimeout(r, 50));
const password = 'un mot de passe solide';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const signUp = () =>
  e2e.client().post('/v1/auth/signup').send({
    email: 'u@example.com',
    password,
    firstName: 'Maëlle',
    locale: 'fr',
    device,
  });
const login = () =>
  e2e
    .client()
    .post('/v1/auth/login')
    .send({ email: 'u@example.com', password, device });
const reauthToken = async (token: string) =>
  (
    await e2e
      .client()
      .post('/v1/auth/reauthenticate')
      .set(auth(token))
      .send({ password })
  ).body.reauthToken as string;
const runFinalizer = () => e2e.app.get(FinalizeDeletionsJob).run();

const binary = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Export (US8)', () => {
  it('returns a ZIP with JSON and CSVs and no secrets', async () => {
    const { body } = await signUp();
    const res = await e2e
      .client()
      .get('/v1/me/export')
      .set(auth(body.tokens.accessToken))
      .buffer(true)
      .parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    const files = unzipSync(new Uint8Array(res.body as Buffer));
    expect(Object.keys(files).sort()).toEqual([
      'budgets.csv',
      'entries.csv',
      'export.json',
      'profile.csv',
      'recurring_rules.csv',
      'sessions.csv',
      'settlements.csv',
      'sign-in-methods.csv',
      'transactions.csv',
    ]);
    const all = Object.values(files)
      .map((f) => strFromU8(f))
      .join('\n');
    expect(all).toContain('Maëlle');
    expect(all).not.toContain('$argon2');
    expect(all).not.toContain(body.tokens.refreshToken);
    const again = await e2e
      .client()
      .get('/v1/me/export')
      .set(auth(body.tokens.accessToken));
    expect(again.status).toBe(429);
  });
});

describe('Deletion (US8)', () => {
  it('requires a fresh re-authentication', async () => {
    const { body } = await signUp();
    const res = await e2e
      .client()
      .delete('/v1/me')
      .set(auth(body.tokens.accessToken))
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('REAUTH_REQUIRED');
  });

  it('schedules deletion in 7 days, ends sessions, mails a cancel link and restricts the account', async () => {
    const { body } = await signUp();
    const token = await reauthToken(body.tokens.accessToken);
    const res = await e2e
      .client()
      .delete('/v1/me')
      .set(auth(body.tokens.accessToken))
      .send({ reauthToken: token });
    expect(res.status).toBe(202);
    const days =
      (new Date(res.body.deletionScheduledAt).getTime() - Date.now()) /
      86_400_000;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
    expect(
      (await e2e.client().get('/v1/me').set(auth(body.tokens.accessToken)))
        .body,
    ).toEqual({ error: 'SESSION_ENDED', reason: 'account_deletion' });
    await flush();
    e2e.mailbox.assertSent({ to: 'u@example.com', subject: /Suppression/ });

    const signedIn = (await login()).body;
    expect(signedIn.me.status).toBe('pending_deletion');
    expect(
      (await e2e.client().get('/v1/me').set(auth(signedIn.tokens.accessToken)))
        .status,
    ).toBe(200);
    const blocked = await e2e
      .client()
      .patch('/v1/me')
      .set(auth(signedIn.tokens.accessToken))
      .send({ firstName: 'X' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toBe('ACCOUNT_PENDING_DELETION');

    const signUpAgain = await signUp();
    expect(signUpAgain.status).toBe(409);
    expect(signUpAgain.body.error).toBe('ACCOUNT_PENDING_DELETION');

    const cancelled = await e2e
      .client()
      .post('/v1/me/deletion/cancel')
      .set(auth(signedIn.tokens.accessToken));
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe('active');
    expect(
      (
        await e2e
          .client()
          .patch('/v1/me')
          .set(auth(signedIn.tokens.accessToken))
          .send({ firstName: 'Maëlle' })
      ).status,
    ).toBe(200);
  });

  it('can be cancelled once with the emailed link', async () => {
    const { body } = await signUp();
    await e2e
      .client()
      .delete('/v1/me')
      .set(auth(body.tokens.accessToken))
      .send({ reauthToken: await reauthToken(body.tokens.accessToken) });
    await flush();
    const link = e2e.mailbox
      .find({ subject: /Suppression/ })!
      .link(/cancel-deletion/)
      .searchParams.get('t');
    expect(
      (
        await e2e
          .client()
          .post('/v1/me/deletion/cancel-by-link')
          .send({ token: link })
      ).status,
    ).toBe(204);
    expect(
      (
        await e2e
          .client()
          .post('/v1/me/deletion/cancel-by-link')
          .send({ token: link })
      ).status,
    ).toBe(410);
    expect((await login()).body.me.status).toBe('active');
  });

  it('erases everything after 7 days and frees the email', async () => {
    const apple = await e2e
      .client()
      .post('/v1/auth/apple')
      .send({
        identityToken: appleToken('apple-del', 'u@example.com'),
        authorizationCode: 'code-del',
        locale: 'fr',
        device,
      });
    const token = apple.body.tokens.accessToken as string;
    const reauth = (
      await e2e
        .client()
        .post('/v1/auth/reauthenticate')
        .set(auth(token))
        .send({
          provider: 'apple',
          identityToken: appleToken('apple-del', null),
        })
    ).body.reauthToken;
    expect(
      (
        await e2e
          .client()
          .delete('/v1/me')
          .set(auth(token))
          .send({ reauthToken: reauth })
      ).status,
    ).toBe(202);

    expect(await runFinalizer()).toBe(0);
    await e2e.db.execute(
      sql`UPDATE users SET deletion_scheduled_at = now() - interval '1 minute'`,
    );
    expect(await runFinalizer()).toBe(1);

    for (const table of [
      'users',
      'auth_identities',
      'sessions',
      'email_tokens',
    ]) {
      const rows = await e2e.db.execute(sql.raw(`SELECT 1 FROM ${table}`));
      expect(rows.rows).toHaveLength(0);
    }
    const events = await e2e.db.execute<{
      user_id: string | null;
      type: string;
    }>(sql`SELECT user_id, type FROM security_events`);
    expect(events.rows.every((e) => e.user_id === null)).toBe(true);
    expect(events.rows.map((e) => e.type)).toContain('account_deleted');
    expect(providers.apple.revoked).toContain('apple-refresh-for-code-del');
    await flush();
    e2e.mailbox.assertSent({ to: 'u@example.com', subject: /supprimé/ });

    const fresh = await signUp();
    expect(fresh.status).toBe(201);
    expect(fresh.body.me.id).not.toBe(apple.body.me.id);
  });
});
