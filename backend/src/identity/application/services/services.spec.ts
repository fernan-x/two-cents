import { User } from '../../domain/entities/user';
import { Email } from '../../domain/value-objects/email';
import { FirstName } from '../../domain/value-objects/first-name';
import { createFakes } from '../testing/fakes';
import { Authenticator } from './authenticator';
import { MeView } from './me-view';
import { SessionIssuer } from './session-issuer';

function setup() {
  const f = createFakes();
  const meView = new MeView(f.budgets, f.signInMethods);
  const issuer = new SessionIssuer(
    f.sessions,
    f.secrets,
    f.accessTokens,
    f.ids,
    f.clock,
    meView,
  );
  const authenticator = new Authenticator(
    f.accessTokens,
    f.sessions,
    f.users,
    f.clock,
  );
  const user = User.register({
    id: f.ids.next(),
    email: Email.create('maelle@example.com'),
    firstName: FirstName.create('Maëlle'),
    locale: 'fr',
    passwordHash: 'hashed:x',
    emailConfirmed: false,
    now: f.clock.now(),
  });
  return { f, issuer, authenticator, user };
}

const device = { deviceName: 'iPhone de Maëlle', platform: 'ios' as const };

describe('SessionIssuer', () => {
  it('opens a session and returns tokens + Me', async () => {
    const { f, issuer, user } = setup();
    await f.users.save(user);
    f.signInMethods.byUser.set(user.id, ['apple']);
    const result = await issuer.open(user, 'password', device);
    expect(result.tokens.refreshToken).toBe('token-1');
    expect(
      f.sessions.rows.get(result.sessionId)?.toSnapshot().refreshTokenHash,
    ).toBe('h(token-1)');
    expect(result.me).toMatchObject({
      email: 'maelle@example.com',
      emailConfirmed: false,
      signInMethods: ['password', 'apple'],
      status: 'active',
      hasBudget: false,
      deletionScheduledAt: null,
    });
  });
});

describe('Authenticator', () => {
  it('accepts a token for an active session', async () => {
    const { f, issuer, authenticator, user } = setup();
    await f.users.save(user);
    const { tokens, sessionId } = await issuer.open(user, 'password', device);
    await expect(
      authenticator.authenticate(tokens.accessToken),
    ).resolves.toMatchObject({
      userId: user.id,
      sessionId,
      firstName: 'Maëlle',
    });
  });

  it('rejects missing or invalid tokens', async () => {
    const { authenticator } = setup();
    await expect(authenticator.authenticate(undefined)).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    await expect(authenticator.authenticate('garbage')).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('rejects a revoked session with its reason', async () => {
    const { f, issuer, authenticator, user } = setup();
    await f.users.save(user);
    const { tokens } = await issuer.open(user, 'password', device);
    await f.sessions.revokeAllForUser(
      user.id,
      'revoked_by_user',
      f.clock.now(),
    );
    await expect(
      authenticator.authenticate(tokens.accessToken),
    ).rejects.toMatchObject({
      code: 'SESSION_ENDED',
      details: { reason: 'revoked_by_user' },
    });
  });

  it('rejects a session idle for more than 90 days as expired', async () => {
    const { f, issuer, authenticator, user } = setup();
    await f.users.save(user);
    const { tokens } = await issuer.open(user, 'password', device);
    f.clock.advance(91 * 86_400_000);
    await expect(
      authenticator.authenticate(tokens.accessToken),
    ).rejects.toMatchObject({
      details: { reason: 'expired' },
    });
  });
});
