import { buildServices } from '../testing/build';
import { SignUp } from './sign-up';
import { UpdateProfile } from './update-profile';

it('updates only the given fields', async () => {
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
  const created = await signUp.execute({
    email: 'u@example.com',
    password: 'un mot de passe solide',
    firstName: 'U',
    locale: 'fr',
    device: { deviceName: 'x', platform: 'ios' },
  });
  const update = new UpdateProfile(f.users, f.clock, s.meView);
  const me = await update.execute(created.me.id, { colorKey: 'pink' });
  expect(me).toMatchObject({
    firstName: 'U',
    colorKey: 'pink',
    locale: 'fr',
    currency: 'EUR',
  });
  await expect(
    update.execute(created.me.id, { firstName: ' ' }),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
});
