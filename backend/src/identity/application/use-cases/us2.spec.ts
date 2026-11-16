import { buildServices } from '../testing/build';
import { GetMe, LogIn, LogOut, RefreshSession } from './sessions';
import { SignUp } from './sign-up';

const device = { deviceName: 'iPhone', platform: 'ios' as const };
const password = 'un mot de passe solide';

async function setup() {
  const s = buildServices();
  const { f } = s;
  const signUp = new SignUp(
    f.users,
    f.hasher,
    f.breach,
    f.events,
    f.tx,
    f.ids,
    f.clock,
    s.sessionIssuer,
    s.confirmation,
  );
  const logIn = new LogIn(
    f.users,
    f.hasher,
    f.events,
    f.tx,
    s.passwords,
    s.sessionIssuer,
  );
  const refresh = new RefreshSession(
    f.sessions,
    f.secrets,
    f.accessTokens,
    f.events,
    f.tx,
    f.clock,
  );
  const logOut = new LogOut(f.sessions, f.clock);
  const getMe = new GetMe(f.users, s.meView);
  const created = await signUp.execute({
    email: 'u@example.com',
    password,
    firstName: 'U',
    locale: 'fr',
    device,
  });
  return { ...s, logIn, refresh, logOut, getMe, created };
}

describe('LogIn', () => {
  it('locks after 5 failures and mails the user once', async () => {
    const { f, logIn } = await setup();
    for (let i = 0; i < 5; i += 1) {
      await expect(
        logIn.execute({
          email: 'u@example.com',
          password: 'nope nope nope',
          device,
        }),
      ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    }
    await expect(
      logIn.execute({ email: 'u@example.com', password, device }),
    ).rejects.toMatchObject({
      code: 'ACCOUNT_LOCKED',
      details: { retryAfterSeconds: 900 },
    });
    expect(
      f.mailer.sent.filter((m) => m.mail.kind === 'account_locked'),
    ).toHaveLength(1);
    f.clock.advance(15 * 60_000);
    await expect(
      logIn.execute({ email: 'u@example.com', password, device }),
    ).resolves.toMatchObject({ me: { email: 'u@example.com' } });
  });

  it('does not reveal unknown emails', async () => {
    const { logIn } = await setup();
    await expect(
      logIn.execute({ email: 'ghost@example.com', password, device }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });
});

describe('RefreshSession', () => {
  it('rotates and detects reuse of the previous token', async () => {
    const { refresh, created } = await setup();
    const next = await refresh.execute(created.tokens.refreshToken);
    expect(next.tokens.refreshToken).not.toBe(created.tokens.refreshToken);
    await expect(
      refresh.execute(created.tokens.refreshToken),
    ).rejects.toMatchObject({ details: { reason: 'reuse_detected' } });
    await expect(
      refresh.execute(next.tokens.refreshToken),
    ).rejects.toMatchObject({ code: 'SESSION_ENDED' });
  });

  it('expires after 90 idle days', async () => {
    const { f, refresh, created } = await setup();
    f.clock.advance(90 * 86_400_000 + 1);
    await expect(
      refresh.execute(created.tokens.refreshToken),
    ).rejects.toMatchObject({ details: { reason: 'expired' } });
  });
});

describe('LogOut / GetMe', () => {
  it('revokes the session and returns Me', async () => {
    const { f, logOut, getMe, created } = await setup();
    expect((await getMe.execute(created.me.id)).firstName).toBe('U');
    const sessionId = [...f.sessions.rows.keys()][0];
    await logOut.execute(sessionId);
    expect(f.sessions.rows.get(sessionId)?.revokedReason).toBe('logout');
  });
});
