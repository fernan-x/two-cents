import { buildServices } from '../testing/build';
import {
  ConfirmLinkByEmail,
  IdentityLinker,
  LinkIdentityWithPassword,
  RequestLinkByEmail,
} from './link-identity';
import { SignInWithProvider } from './sign-in-with-provider';
import { SignUp } from './sign-up';

const device = { deviceName: 'iPhone', platform: 'ios' as const };

function setup() {
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
  const provider = new SignInWithProvider(
    f.appleVerifier,
    f.googleVerifier,
    f.appleCodes,
    f.encryptor,
    f.secrets,
    f.users,
    f.identities,
    f.pendingLinks,
    f.events,
    f.tx,
    f.ids,
    f.clock,
    s.sessionIssuer,
  );
  const linker = new IdentityLinker(
    f.users,
    f.identities,
    f.pendingLinks,
    f.events,
    f.ids,
    f.clock,
    s.sessionIssuer,
  );
  const linkPassword = new LinkIdentityWithPassword(
    f.pendingLinks,
    f.secrets,
    f.users,
    f.tx,
    f.clock,
    s.passwords,
    linker,
  );
  const linkEmail = new RequestLinkByEmail(
    f.pendingLinks,
    f.secrets,
    f.users,
    f.mailer,
    f.links,
    f.tx,
    f.clock,
    s.emailTokens,
  );
  const confirmLink = new ConfirmLinkByEmail(
    f.pendingLinks,
    f.tx,
    f.clock,
    s.emailTokens,
    linker,
  );
  return { ...s, signUp, provider, linkPassword, linkEmail, confirmLink };
}

const signUpInput = {
  email: 'Fabien@Example.com',
  password: 'un mot de passe solide',
  firstName: 'Fabien',
  locale: 'fr' as const,
  device,
};

describe('SignUp', () => {
  it('creates the user, a session, a signup event and a confirmation email', async () => {
    const { f, signUp } = setup();
    const result = await signUp.execute(signUpInput);
    expect(result.me.emailConfirmed).toBe(false);
    expect(f.users.rows.size).toBe(1);
    expect(f.sessions.rows.size).toBe(1);
    expect(f.events.types()).toEqual(['signup']);
    expect(f.mailer.last()?.mail).toMatchObject({ kind: 'confirm_email' });
  });

  it('rejects taken, breached and short passwords', async () => {
    const { signUp } = setup();
    await signUp.execute(signUpInput);
    await expect(
      signUp.execute({ ...signUpInput, email: 'fabien@example.com' }),
    ).rejects.toMatchObject({ code: 'EMAIL_IN_USE' });
    await expect(
      signUp.execute({
        ...signUpInput,
        email: 'x@y.fr',
        password: 'azertyuiop',
      }),
    ).rejects.toMatchObject({ code: 'PASSWORD_BREACHED' });
    await expect(
      signUp.execute({ ...signUpInput, email: 'x@y.fr', password: 'short' }),
    ).rejects.toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
  });
});

describe('SignInWithProvider + linking', () => {
  const claims = (sub: string, email: string | null) => ({
    subject: sub,
    email,
    emailVerified: true,
    isPrivateRelay: false,
    givenName: 'Fabien',
  });

  it('creates a confirmed account and stores the encrypted Apple refresh token', async () => {
    const { f, provider } = setup();
    f.appleVerifier.claims.set('t', claims('a-1', 'f@example.com'));
    const result = await provider.execute({
      provider: 'apple',
      token: 't',
      authorizationCode: 'c',
      locale: 'fr',
      device,
    });
    expect(result.created).toBe(true);
    expect(result.me.emailConfirmed).toBe(true);
    const identity = [...f.identities.rows.values()][0];
    expect(identity.appleRefreshTokenEnc?.toString()).toBe(
      'enc:apple-refresh:c',
    );
  });

  it('asks for proof when the email belongs to another account, then links with the password', async () => {
    const { f, signUp, provider, linkPassword } = setup();
    await signUp.execute(signUpInput);
    f.googleVerifier.claims.set('g', claims('g-1', 'fabien@example.com'));
    const error = await provider
      .execute({ provider: 'google', token: 'g', locale: 'fr', device })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: 'LINK_REQUIRED',
      details: { emailHint: 'F•••@Example.com' },
    });
    expect(f.identities.rows.size).toBe(0);
    const linkToken = (error as { details: { linkToken: string } }).details
      .linkToken;
    await expect(
      linkPassword.execute({ linkToken, password: 'wrong password!', device }),
    ).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    const linked = await linkPassword.execute({
      linkToken,
      password: signUpInput.password,
      device,
    });
    expect(linked.me.signInMethods).toEqual(['password', 'google']);
    await expect(
      linkPassword.execute({
        linkToken,
        password: signUpInput.password,
        device,
      }),
    ).rejects.toMatchObject({ code: 'LINK_EXPIRED' });
  });

  it('expires a pending link after 15 minutes but the emailed link stays valid for 1 hour', async () => {
    const { f, signUp, provider, linkPassword, linkEmail, confirmLink } =
      setup();
    await signUp.execute(signUpInput);
    f.googleVerifier.claims.set('g', claims('g-1', 'fabien@example.com'));
    const error = await provider
      .execute({ provider: 'google', token: 'g', locale: 'fr', device })
      .catch((e: unknown) => e);
    const linkToken = (error as { details: { linkToken: string } }).details
      .linkToken;
    await linkEmail.execute({ linkToken });
    const mail = f.mailer.last('link_account')!.mail as { link: string };
    const token = new URL(mail.link).searchParams.get('t')!;
    f.clock.advance(20 * 60_000);
    await expect(
      linkPassword.execute({
        linkToken,
        password: signUpInput.password,
        device,
      }),
    ).rejects.toMatchObject({ code: 'LINK_EXPIRED' });
    const linked = await confirmLink.execute({ token, device });
    expect(linked.me.signInMethods).toContain('google');
  });

  it('rejects invalid provider tokens', async () => {
    const { provider } = setup();
    await expect(
      provider.execute({
        provider: 'google',
        token: 'nope',
        locale: 'fr',
        device,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PROVIDER_TOKEN' });
  });
});
