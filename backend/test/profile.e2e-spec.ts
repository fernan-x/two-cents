import { sql } from 'drizzle-orm';
import { createE2eApp, device, type E2eApp } from './support/e2e-app';
import { fakeProviders } from './support/fake-providers';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

const signUp = (email = 'u@example.com') =>
  e2e.client().post('/v1/auth/signup').send({
    email,
    password: 'un mot de passe solide',
    firstName: 'U',
    locale: 'fr',
    device,
  });
const patch = (token: string, body: Record<string, unknown>) =>
  e2e
    .client()
    .patch('/v1/me')
    .set('Authorization', `Bearer ${token}`)
    .send(body);

describe('Profile (US6)', () => {
  it('saves every field and keeps accents in NFC', async () => {
    const { body } = await signUp();
    const res = await patch(body.tokens.accessToken, {
      firstName: '  Maëlle ',
      avatarKey: 'leaf',
      colorKey: 'teal',
      locale: 'en',
      currency: 'USD',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      firstName: 'Maëlle',
      avatarKey: 'leaf',
      colorKey: 'teal',
      locale: 'en',
      currency: 'USD',
    });
    const row = await e2e.db.execute<{ first_name: string }>(
      sql`SELECT first_name FROM users`,
    );
    expect(row.rows[0].first_name).toBe('Maëlle'.normalize('NFC'));
  });

  it('rejects blank or too long names, unknown keys and lowercase currencies', async () => {
    const { body } = await signUp();
    const token = body.tokens.accessToken;
    for (const bad of [
      { firstName: '   ' },
      { firstName: 'é'.repeat(51) },
      { avatarKey: 'unicorn' },
      { colorKey: 'gold' },
      { currency: 'eur' },
      {},
    ]) {
      const res = await patch(token, bad);
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_FAILED');
    }
  });

  it('only changes the caller’s own profile', async () => {
    const a = (await signUp('a@example.com')).body;
    const b = (await signUp('b@example.com')).body;
    await patch(a.tokens.accessToken, { firstName: 'Alice' });
    const meB = await e2e
      .client()
      .get('/v1/me')
      .set('Authorization', `Bearer ${b.tokens.accessToken}`);
    expect(meB.body.firstName).toBe('U');
  });
});
