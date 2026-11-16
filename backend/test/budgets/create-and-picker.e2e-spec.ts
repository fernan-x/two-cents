import { createBudget, seedMember } from '../support/budgets';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import { fakeProviders } from '../support/fake-providers';
import { as, signUpUser } from '../support/users';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

describe('US1 Create a budget', () => {
  it('creates a budget with the defaults; the creator is its sole owner', async () => {
    const fabien = await signUpUser(e2e, { firstName: 'Fabien' });
    const res = await as(e2e, fabien).post('/v1/budgets', {
      name: '  Maison Maëlle & Fabien ',
      timeZone: 'Europe/Paris',
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: 'Maison Maëlle & Fabien',
      currency: 'EUR',
      monthStartDay: 1,
      myRole: 'owner',
      memberCount: 1,
      myIncomeMissing: true,
      pendingMonthStartDay: null,
    });
    expect(res.body.members).toEqual([
      expect.objectContaining({
        displayName: 'Fabien',
        role: 'owner',
        isMe: true,
      }),
    ]);
    const me = await as(e2e, fabien).get('/v1/me');
    expect(me.body.hasBudget).toBe(true);
  });

  it('start day 28 on 16 November: 28 Oct – 27 Nov (scenario 2)', async () => {
    e2e.clock.set('2026-11-16T10:00:00Z');
    const fabien = await signUpUser(e2e);
    const budget = await createBudget(e2e, fabien, { monthStartDay: 28 });
    expect(budget.currentMonth).toEqual({
      start: '2026-10-28',
      end: '2026-11-27',
    });
  });

  it('refuses an empty or whitespace-only name (scenario 3)', async () => {
    const fabien = await signUpUser(e2e);
    for (const name of ['', '   ']) {
      const res = await as(e2e, fabien).post('/v1/budgets', {
        name,
        timeZone: 'Europe/Paris',
      });
      expect(res.status).toBe(400);
    }
    const long = await as(e2e, fabien).post('/v1/budgets', {
      name: 'x'.repeat(61),
      timeZone: 'Europe/Paris',
    });
    expect(long.status).toBe(400);
    const badDay = await as(e2e, fabien).post('/v1/budgets', {
      name: 'Ok',
      monthStartDay: 29,
      timeZone: 'Europe/Paris',
    });
    expect(badDay.status).toBe(400);
  });

  it('a second budget appears next to the first (scenario 4)', async () => {
    const fabien = await signUpUser(e2e);
    const first = await createBudget(e2e, fabien);
    const second = await createBudget(e2e, fabien, { name: 'Chatterie' });
    const mine = await as(e2e, fabien).get('/v1/me/budgets');
    expect(mine.status).toBe(200);
    expect(mine.body.budgets.map((b: { id: string }) => b.id)).toEqual([
      second.id,
      first.id,
    ]);
    const get = await as(e2e, fabien).get(`/v1/budgets/${first.id}`);
    expect(get.status).toBe(200);
  });
});

describe('US3 Switch between budgets', () => {
  it('lists budgets with my role and reopens the last opened, on every device', async () => {
    const fabien = await signUpUser(e2e, { firstName: 'Fabien' });
    const maelle = await signUpUser(e2e, { firstName: 'Maëlle' });
    const maison = await createBudget(e2e, maelle, { name: 'Maison' });
    await seedMember(e2e, maison.id, fabien, 'member');
    const chatterie = await createBudget(e2e, fabien, { name: 'Chatterie' });

    const open = await as(e2e, fabien).post(`/v1/budgets/${maison.id}/open`);
    expect(open.status).toBe(204);
    const list = await as(e2e, fabien).get('/v1/me/budgets');
    expect(list.body.budgets).toEqual([
      expect.objectContaining({
        id: maison.id,
        myRole: 'member',
        memberCount: 2,
      }),
      expect.objectContaining({
        id: chatterie.id,
        myRole: 'owner',
        memberCount: 1,
      }),
    ]);

    // A second session of the same account sees the same order (FR-036: per account).
    const login = await e2e
      .client()
      .post('/v1/auth/login')
      .send({
        email: fabien.email,
        password: 'un mot de passe solide',
        device: { deviceName: 'iPad', platform: 'ios' },
      });
    expect(login.status).toBe(200);
    const other = await e2e
      .client()
      .get('/v1/me/budgets')
      .set('Authorization', `Bearer ${login.body.tokens.accessToken}`);
    expect(other.body.budgets[0].id).toBe(maison.id);
  });

  it('drops a budget the user left or that was deleted (scenario 3)', async () => {
    const fabien = await signUpUser(e2e);
    const maelle = await signUpUser(e2e);
    const shared = await createBudget(e2e, maelle, { name: 'Partagé' });
    await seedMember(e2e, shared.id, fabien, 'member');
    const own = await createBudget(e2e, fabien, { name: 'Perso' });
    expect(
      (await as(e2e, fabien).post(`/v1/budgets/${shared.id}/leave`)).status,
    ).toBe(204);
    await as(e2e, fabien).delete(`/v1/budgets/${own.id}`, {
      confirmName: 'Perso',
    });
    const list = await as(e2e, fabien).get('/v1/me/budgets');
    expect(list.body.budgets).toEqual([]);
    expect((await as(e2e, fabien).get('/v1/me')).body.hasBudget).toBe(false);
  });
});
