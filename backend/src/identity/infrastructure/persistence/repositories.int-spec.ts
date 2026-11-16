import '../../../../test/support/test-env';
import {
  createTestDatabase,
  truncateAll,
} from '../../../../test/support/database';
import { EmailToken } from '../../domain/entities/email-token';
import { Session } from '../../domain/entities/session';
import { User } from '../../domain/entities/user';
import { Email } from '../../domain/value-objects/email';
import { FirstName } from '../../domain/value-objects/first-name';
import { DrizzleEmailTokenRepository } from './drizzle-email-token.repository';
import { DrizzleSessionRepository } from './drizzle-session.repository';
import { DrizzleUserRepository } from './drizzle-user.repository';

const now = new Date('2026-11-16T10:00:00Z');
const { db, runner, close } = createTestDatabase();
const users = new DrizzleUserRepository(runner);
const sessions = new DrizzleSessionRepository(runner);
const tokens = new DrizzleEmailTokenRepository(runner);

const newUser = (id: string, email: string) =>
  User.register({
    id,
    email: Email.create(email),
    firstName: FirstName.create('Maëlle'),
    locale: 'fr',
    passwordHash: 'hash',
    emailConfirmed: false,
    now,
  });

const newSession = (id: string, userId: string, hash: string) =>
  Session.open({
    id,
    userId,
    authMethod: 'password',
    refreshTokenHash: hash,
    device: { deviceName: 'iPhone', platform: 'ios' },
    now,
  });

beforeEach(() => truncateAll(db));
afterAll(() => close());

describe('Drizzle identity repositories', () => {
  it('saves and finds users by id and normalized email', async () => {
    await users.save(
      newUser('0195f0e0-0000-7000-8000-000000000001', 'Maelle@Example.com'),
    );
    const found = await users.findByNormalizedEmail('maelle@example.com');
    expect(found?.email).toBe('Maelle@Example.com');
    expect(found?.firstName).toBe('Maëlle');
    expect((await users.findById(found!.id))?.id).toBe(found!.id);
  });

  it('enforces unique normalized emails', async () => {
    await users.save(newUser('0195f0e0-0000-7000-8000-000000000001', 'a@b.fr'));
    await expect(
      users.save(newUser('0195f0e0-0000-7000-8000-000000000002', 'A@B.fr')),
    ).rejects.toThrow();
  });

  it('lists active sessions and revokes all but one', async () => {
    const userId = '0195f0e0-0000-7000-8000-000000000001';
    await users.save(newUser(userId, 'a@b.fr'));
    await sessions.save(
      newSession('0195f0e0-0000-7000-8000-0000000000a1', userId, 'h1'),
    );
    await sessions.save(
      newSession('0195f0e0-0000-7000-8000-0000000000a2', userId, 'h2'),
    );
    expect(await sessions.listActiveByUser(userId, now)).toHaveLength(2);
    const count = await sessions.revokeAllForUser(
      userId,
      'revoked_by_user',
      now,
      '0195f0e0-0000-7000-8000-0000000000a1',
    );
    expect(count).toBe(1);
    expect((await sessions.findByRefreshHash('h2'))?.isActive(now)).toBe(false);
    expect((await sessions.findByRefreshHash('h1'))?.isActive(now)).toBe(true);
  });

  it('supersedes older email tokens and commits only with the transaction', async () => {
    const userId = '0195f0e0-0000-7000-8000-000000000001';
    await users.save(newUser(userId, 'a@b.fr'));
    const token = EmailToken.issue({
      id: '0195f0e0-0000-7000-8000-0000000000b1',
      userId,
      purpose: 'reset_password',
      tokenHash: 't1',
      now,
    });
    await tokens.save(token);
    await tokens.supersedeAll(userId, 'reset_password', now);
    expect((await tokens.findByHash('t1'))?.isValid(now)).toBe(false);

    await expect(
      runner.run(async () => {
        await users.save(
          newUser('0195f0e0-0000-7000-8000-000000000009', 'rollback@b.fr'),
        );
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await users.findByNormalizedEmail('rollback@b.fr')).toBeNull();
  });
});
