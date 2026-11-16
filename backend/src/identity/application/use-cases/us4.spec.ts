import { buildServices } from '../testing/build';
import { CompletePasswordReset, RequestPasswordReset } from './password-reset';
import { SignUp } from './sign-up';

const device = { deviceName: 'iPhone', platform: 'ios' as const };

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
  const request = new RequestPasswordReset(
    f.users,
    f.events,
    f.mailer,
    f.links,
    f.tx,
    s.emailTokens,
  );
  const complete = new CompletePasswordReset(
    f.users,
    f.sessions,
    f.hasher,
    f.breach,
    f.events,
    f.mailer,
    f.tx,
    f.clock,
    s.emailTokens,
  );
  await signUp.execute({
    email: 'u@example.com',
    password: 'un mot de passe solide',
    firstName: 'U',
    locale: 'fr',
    device,
  });
  const tokenOf = () =>
    new URL(
      (f.mailer.last('reset_password')!.mail as { link: string }).link,
    ).searchParams.get('t')!;
  return { ...s, request, complete, tokenOf };
}

describe('Password reset', () => {
  it('is silent for unknown emails', async () => {
    const { f, request } = await setup();
    const before = f.mailer.sent.length;
    await request.execute('ghost@example.com');
    expect(f.mailer.sent.length).toBe(before);
  });

  it('changes the password, revokes sessions and mails a notice', async () => {
    const { f, request, complete, tokenOf } = await setup();
    await request.execute('U@Example.com');
    await complete.execute({
      token: tokenOf(),
      newPassword: 'un tout nouveau mot de passe',
    });
    const user = [...f.users.rows.values()][0];
    expect(user.passwordHash).toBe('hashed:un tout nouveau mot de passe');
    expect(
      [...f.sessions.rows.values()].every(
        (s) => s.revokedReason === 'password_changed',
      ),
    ).toBe(true);
    expect(f.mailer.last()?.mail.kind).toBe('password_changed');
  });

  it('expires after 1 hour', async () => {
    const { f, request, complete, tokenOf } = await setup();
    await request.execute('u@example.com');
    f.clock.advance(3_600_000);
    await expect(
      complete.execute({
        token: tokenOf(),
        newPassword: 'un tout nouveau mot de passe',
      }),
    ).rejects.toMatchObject({ code: 'TOKEN_INVALID' });
  });
});
