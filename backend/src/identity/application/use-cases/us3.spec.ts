import { buildServices } from '../testing/build';
import { ConfirmEmail, ResendConfirmation } from './email-confirmation';
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
  const confirm = new ConfirmEmail(
    f.users,
    f.events,
    f.tx,
    f.clock,
    s.emailTokens,
    s.meView,
  );
  const resend = new ResendConfirmation(f.users, f.tx, s.confirmation);
  const created = await signUp.execute({
    email: 'u@example.com',
    password: 'un mot de passe solide',
    firstName: 'U',
    locale: 'fr',
    device,
  });
  const tokenOf = () =>
    new URL(
      (f.mailer.last('confirm_email')!.mail as { link: string }).link,
    ).searchParams.get('t')!;
  return { ...s, confirm, resend, created, tokenOf };
}

describe('ConfirmEmail / ResendConfirmation', () => {
  it('confirms once and records an event', async () => {
    const { f, confirm, tokenOf } = await setup();
    const token = tokenOf();
    expect((await confirm.execute(token)).me.emailConfirmed).toBe(true);
    expect(f.events.types()).toContain('email_confirmed');
    await expect(confirm.execute(token)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('expires after 24 hours', async () => {
    const { f, confirm, tokenOf } = await setup();
    const token = tokenOf();
    f.clock.advance(24 * 3_600_000);
    await expect(confirm.execute(token)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
  });

  it('resend supersedes the old token and refuses once confirmed', async () => {
    const { confirm, resend, created, tokenOf } = await setup();
    const first = tokenOf();
    await resend.execute(created.me.id);
    await expect(confirm.execute(first)).rejects.toMatchObject({
      code: 'TOKEN_INVALID',
    });
    await confirm.execute(tokenOf());
    await expect(resend.execute(created.me.id)).rejects.toMatchObject({
      code: 'ALREADY_CONFIRMED',
    });
  });
});
