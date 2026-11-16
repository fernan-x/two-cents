import { User } from '../../domain/entities/user';
import { Email } from '../../domain/value-objects/email';
import { FirstName } from '../../domain/value-objects/first-name';
import { buildServices } from '../testing/build';
import {
  ListSessions,
  RevokeOtherSessions,
  RevokeSession,
} from './manage-sessions';

it('lists, revokes one and revokes the others', async () => {
  const s = buildServices();
  const { f } = s;
  const user = User.register({
    id: 'u1',
    email: Email.create('u@e.fr'),
    firstName: FirstName.create('U'),
    locale: 'fr',
    passwordHash: null,
    emailConfirmed: true,
    now: f.clock.now(),
  });
  await f.users.save(user);
  const ids: string[] = [];
  for (const name of ['a', 'b', 'c'])
    ids.push(
      (
        await s.sessionIssuer.open(user, 'password', {
          deviceName: name,
          platform: 'ios',
        })
      ).sessionId,
    );
  const auth = { userId: 'u1', sessionId: ids[0] };
  expect(
    (await new ListSessions(f.sessions, f.clock).execute(auth)).sessions.filter(
      (x) => x.current,
    ),
  ).toHaveLength(1);
  const revoke = new RevokeSession(f.sessions, f.events, f.tx, f.clock);
  await expect(revoke.execute(auth, ids[0])).rejects.toMatchObject({
    code: 'CANNOT_REVOKE_CURRENT',
  });
  await revoke.execute(auth, ids[1]);
  await expect(
    revoke.execute({ userId: 'someone-else', sessionId: 'x' }, ids[2]),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(
    await new RevokeOtherSessions(f.sessions, f.events, f.tx, f.clock).execute(
      auth,
    ),
  ).toEqual({ revokedCount: 1 });
});
