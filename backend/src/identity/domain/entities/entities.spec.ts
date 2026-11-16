import { Email } from '../value-objects/email';
import { FirstName } from '../value-objects/first-name';
import { EmailToken } from './email-token';
import { Session } from './session';
import { User } from './user';

const now = new Date('2026-11-16T10:00:00Z');

describe('User', () => {
  const register = (emailConfirmed: boolean) =>
    User.register({
      id: 'u1',
      email: Email.create('Maelle@Example.com'),
      firstName: FirstName.create('Maëlle'),
      locale: 'fr',
      passwordHash: 'hash',
      emailConfirmed,
      now,
    });

  it('registers an active user with defaults', () => {
    const user = register(false);
    expect(user.status).toBe('active');
    expect(user.emailNormalized).toBe('maelle@example.com');
    expect(user.emailConfirmed).toBe(false);
    expect(user.toSnapshot().currency).toBe('EUR');
  });

  it('provider accounts are confirmed at creation', () => {
    expect(register(true).emailConfirmed).toBe(true);
  });

  it('assertActive throws for pending deletion', () => {
    const user = User.fromPersistence({
      ...register(false).toSnapshot(),
      status: 'pending_deletion',
    });
    expect(() => user.assertActive()).toThrow(
      expect.objectContaining({ code: 'ACCOUNT_PENDING_DELETION' }),
    );
  });
});

describe('Session', () => {
  const open = () =>
    Session.open({
      id: 's1',
      userId: 'u1',
      authMethod: 'password',
      refreshTokenHash: 'h1',
      device: { deviceName: '  iPhone de Maëlle ', platform: 'ios' },
      now,
    });

  it('opens active and trims the device name', () => {
    const session = open();
    expect(session.isActive(now)).toBe(true);
    expect(session.toSnapshot().deviceName).toBe('iPhone de Maëlle');
  });

  it('revoke keeps the first reason', () => {
    const session = open();
    session.revoke('logout', now);
    session.revoke('password_changed', now);
    expect(session.isActive(now)).toBe(false);
    expect(session.revokedReason).toBe('logout');
  });
});

describe('EmailToken', () => {
  const issue = () =>
    EmailToken.issue({
      id: 't1',
      userId: 'u1',
      purpose: 'reset_password',
      tokenHash: 'h',
      now,
    });

  it('expires 1 h after issue for a reset', () => {
    expect(issue().expiresAt).toEqual(new Date('2026-11-16T11:00:00Z'));
  });

  it('can be consumed once', () => {
    const token = issue();
    token.consume('reset_password', now);
    expect(() => token.consume('reset_password', now)).toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' }),
    );
  });

  it('rejects the wrong purpose, superseded and expired tokens', () => {
    expect(() => issue().consume('confirm_email', now)).toThrow(
      expect.objectContaining({ code: 'TOKEN_INVALID' }),
    );
    const superseded = issue();
    superseded.supersede(now);
    expect(() => superseded.consume('reset_password', now)).toThrow();
    expect(() =>
      issue().consume('reset_password', new Date('2026-11-16T11:00:00Z')),
    ).toThrow();
  });
});
