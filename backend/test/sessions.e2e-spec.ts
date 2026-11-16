import { createE2eApp, device, type E2eApp } from './support/e2e-app';
import { fakeProviders } from './support/fake-providers';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

const password = 'un mot de passe solide';
const signUp = (email = 'u@example.com') =>
  e2e
    .client()
    .post('/v1/auth/signup')
    .send({ email, password, firstName: 'U', locale: 'fr', device });
const login = (deviceName: string) =>
  e2e
    .client()
    .post('/v1/auth/login')
    .send({
      email: 'u@example.com',
      password,
      device: { deviceName, platform: 'android' },
    });
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('Active sessions (US7)', () => {
  it('lists active sessions and marks the current one', async () => {
    const phone = (await signUp()).body;
    await login('Tablette');
    const res = await e2e
      .client()
      .get('/v1/me/sessions')
      .set(auth(phone.tokens.accessToken));
    expect(res.status).toBe(200);
    expect(res.body.sessions).toHaveLength(2);
    expect(
      res.body.sessions.filter((s: { current: boolean }) => s.current),
    ).toHaveLength(1);
    expect(
      res.body.sessions.find((s: { current: boolean }) => !s.current),
    ).toMatchObject({ deviceName: 'Tablette', platform: 'android' });
  });

  it('ends one specific session, never the current one, and hides other users’ sessions', async () => {
    const phone = (await signUp()).body;
    const tablet = (await login('Tablette')).body;
    const other = (await signUp('other@example.com')).body;
    const list = (
      await e2e
        .client()
        .get('/v1/me/sessions')
        .set(auth(phone.tokens.accessToken))
    ).body.sessions as Array<{ id: string; current: boolean }>;
    const current = list.find((s) => s.current)!;
    const tabletSession = list.find((s) => !s.current)!;

    const self = await e2e
      .client()
      .delete(`/v1/me/sessions/${current.id}`)
      .set(auth(phone.tokens.accessToken));
    expect(self.status).toBe(400);
    expect(self.body.error).toBe('CANNOT_REVOKE_CURRENT');

    const foreign = await e2e
      .client()
      .delete(`/v1/me/sessions/${tabletSession.id}`)
      .set(auth(other.tokens.accessToken));
    expect(foreign.status).toBe(404);

    const ok = await e2e
      .client()
      .delete(`/v1/me/sessions/${tabletSession.id}`)
      .set(auth(phone.tokens.accessToken));
    expect(ok.status).toBe(204);
    const after = await e2e
      .client()
      .get('/v1/me')
      .set(auth(tablet.tokens.accessToken));
    expect(after.body).toEqual({
      error: 'SESSION_ENDED',
      reason: 'revoked_by_user',
    });
  });

  it('logs out every other device and stays signed in', async () => {
    const phone = (await signUp()).body;
    const tablet = (await login('Tablette')).body;
    const laptop = (await login('Ordinateur')).body;
    const res = await e2e
      .client()
      .post('/v1/me/sessions/revoke-others')
      .set(auth(phone.tokens.accessToken));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revokedCount: 2 });
    expect(
      (await e2e.client().get('/v1/me').set(auth(tablet.tokens.accessToken)))
        .status,
    ).toBe(401);
    expect(
      (await e2e.client().get('/v1/me').set(auth(laptop.tokens.accessToken)))
        .status,
    ).toBe(401);
    expect(
      (await e2e.client().get('/v1/me').set(auth(phone.tokens.accessToken)))
        .status,
    ).toBe(200);
  });
});
