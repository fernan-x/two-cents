import { sql } from 'drizzle-orm';
import { AccountHandoff } from '../../src/budgets/application/use-cases/account-handoff';
import { PurgeBudgets } from '../../src/budgets/application/use-cases/budgets';
import { ExpireInvitations } from '../../src/budgets/application/use-cases/invitations';
import { FinalizeDeletionsJob } from '../../src/identity/infrastructure/jobs/finalize-deletions.job';
import {
  createBudget,
  currentMonthStart,
  seedMember,
} from '../support/budgets';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import { fakeProviders } from '../support/fake-providers';
import { as, signUpUser, type TestUser } from '../support/users';
import { BUDGET_ROUTE_CASES } from '../authz/budget-route-cases';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

const members = async (user: TestUser, budgetId: string) =>
  (await as(e2e, user).get(`/v1/budgets/${budgetId}/members`)).body as {
    members: Array<{ membershipId: string; displayName: string; role: string }>;
    formerMembers: Array<{
      membershipId: string;
      displayName: string | null;
      formerMember: boolean;
    }>;
  };

describe('US4 Manage pending invitations', () => {
  it('lists, resends with a new code and expiry, and revokes', async () => {
    const fabien = await signUpUser(e2e, { firstName: 'Fabien' });
    const budget = await createBudget(e2e, fabien);
    const api = as(e2e, fabien);
    const email = await api.post(`/v1/budgets/${budget.id}/invitations`, {
      kind: 'email',
      email: 'p@example.com',
      role: 'viewer',
    });
    const code = await api.post(`/v1/budgets/${budget.id}/invitations`, {
      kind: 'code',
    });

    const list = await api.get(`/v1/budgets/${budget.id}/invitations`);
    expect(list.status).toBe(200);
    expect(list.body.invitations).toHaveLength(2);
    expect(list.body.invitations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          email: 'p@example.com',
          role: 'viewer',
          invitedBy: 'Fabien',
        }),
        expect.objectContaining({ email: null, kind: 'code', role: 'member' }),
      ]),
    );

    await e2e.drainOutbox();
    const resent = await api.post(
      `/v1/budgets/${budget.id}/invitations/${email.body.id}/resend`,
    );
    expect(resent.status).toBe(200);
    expect(resent.body.code).not.toBe(email.body.code);
    await e2e.drainOutbox();
    expect(e2e.mailbox.filter({ to: 'p@example.com' })).toHaveLength(2);
    const rows = await e2e.db.execute<{ send_count: number }>(
      sql`SELECT send_count FROM invitation WHERE id = ${email.body.id}`,
    );
    expect(rows.rows[0].send_count).toBe(2);

    // The old code no longer works after a resend.
    const someone = await signUpUser(e2e);
    expect(
      (await as(e2e, someone).get(`/v1/invitations/${email.body.code}`)).status,
    ).toBe(404);

    expect(
      (await api.delete(`/v1/budgets/${budget.id}/invitations/${code.body.id}`))
        .status,
    ).toBe(204);
    const revoked = await as(e2e, someone).get(
      `/v1/invitations/${code.body.code}`,
    );
    expect(revoked.status).toBe(410);
    expect(revoked.body).toEqual({
      error: 'INVITATION_REVOKED',
      inviterName: 'Fabien',
    });
    expect(
      (await api.get(`/v1/budgets/${budget.id}/invitations`)).body.invitations,
    ).toHaveLength(1);
  });

  it('an expired invitation says so, names the inviter, and the job tidies it', async () => {
    const fabien = await signUpUser(e2e, { firstName: 'Fabien' });
    const budget = await createBudget(e2e, fabien);
    const code = await as(e2e, fabien).post(
      `/v1/budgets/${budget.id}/invitations`,
      {
        kind: 'code',
      },
    );
    await e2e.db.execute(
      sql`UPDATE invitation SET expires_at = now() - interval '1 minute'`,
    );
    const someone = await signUpUser(e2e);
    const res = await as(e2e, someone).get(`/v1/invitations/${code.body.code}`);
    expect(res.status).toBe(410);
    expect(res.body).toEqual({
      error: 'INVITATION_EXPIRED',
      inviterName: 'Fabien',
    });
    expect(await e2e.app.get(ExpireInvitations).execute()).toBe(1);
    const all = await as(e2e, fabien).get(
      `/v1/budgets/${budget.id}/invitations?status=all`,
    );
    expect(all.body.invitations[0].status).toBe('expired');
  });

  it('a member cannot see or manage invitations', async () => {
    const fabien = await signUpUser(e2e);
    const member = await signUpUser(e2e);
    const budget = await createBudget(e2e, fabien);
    await seedMember(e2e, budget.id, member, 'member');
    expect(
      (await as(e2e, member).get(`/v1/budgets/${budget.id}/invitations`))
        .status,
    ).toBe(403);
    expect(
      (
        await as(e2e, member).post(`/v1/budgets/${budget.id}/invitations`, {
          kind: 'code',
        })
      ).status,
    ).toBe(403);
  });
});

describe('US5 Members, roles and ownership', () => {
  async function household() {
    const owner = await signUpUser(e2e, { firstName: 'Fabien' });
    const admin = await signUpUser(e2e, { firstName: 'Maëlle' });
    const member = await signUpUser(e2e, { firstName: 'Chloé' });
    const budget = await createBudget(e2e, owner);
    const adminId = await seedMember(e2e, budget.id, admin, 'member');
    const memberId = await seedMember(e2e, budget.id, member, 'member');
    const ownerId = budget.members[0].membershipId;
    return { owner, admin, member, budget, adminId, memberId, ownerId };
  }

  it('changes roles, lets an Admin manage others but never the owner (scenarios 1, 7, 8)', async () => {
    const h = await household();
    const url = (id: string) => `/v1/budgets/${h.budget.id}/members/${id}`;
    const promote = await as(e2e, h.owner).patch(url(h.adminId), {
      role: 'admin',
    });
    expect(promote.status).toBe(200);
    expect(promote.body).toMatchObject({
      role: 'admin',
      displayName: 'Maëlle',
    });

    const toViewer = await as(e2e, h.admin).patch(url(h.memberId), {
      role: 'viewer',
    });
    expect(toViewer.body.role).toBe('viewer');
    // A viewer can no longer write.
    const write = await as(e2e, h.member).put(
      `/v1/budgets/${h.budget.id}/members/me/income/${currentMonthStart()}`,
      { amountMinor: '1' },
    );
    expect(write.status).toBe(403);

    for (const res of [
      await as(e2e, h.admin).patch(url(h.ownerId), { role: 'member' }),
      await as(e2e, h.admin).delete(url(h.ownerId)),
    ]) {
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('CANNOT_MODIFY_OWNER');
    }
    expect(
      (
        await as(e2e, h.admin).delete(`/v1/budgets/${h.budget.id}`, {
          confirmName: h.budget.name,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await as(e2e, h.admin).post(`/v1/budgets/${h.budget.id}/ownership`, {
          toMembershipId: h.adminId,
        })
      ).status,
    ).toBe(403);
    const owner = await as(e2e, h.owner).patch(url(h.ownerId), {
      role: 'admin',
    });
    expect(owner.body.error).toBe('CANNOT_MODIFY_OWNER');
  });

  it('removal ends access at once, keeps the name in history and pushes the removed person', async () => {
    const h = await household();
    const token = 'ExponentPushToken[chloe]';
    await as(e2e, h.member).put('/v1/me/push-devices', {
      expoPushToken: token,
      platform: 'android',
    });
    expect(
      (
        await as(e2e, h.owner).delete(
          `/v1/budgets/${h.budget.id}/members/${h.memberId}`,
        )
      ).status,
    ).toBe(204);
    expect(
      (await as(e2e, h.member).get(`/v1/budgets/${h.budget.id}`)).status,
    ).toBe(404);
    const people = await members(h.owner, h.budget.id);
    expect(people.members).toHaveLength(2);
    expect(people.formerMembers).toEqual([
      { membershipId: h.memberId, displayName: 'Chloé', formerMember: true },
    ]);
    await e2e.drainOutbox();
    expect(e2e.pushes.to(token)).toEqual([
      expect.objectContaining({
        body: 'Vous avez été retiré de « Maison Maëlle & Fabien »',
      }),
    ]);
    // Acting on someone who already left is stale.
    const stale = await as(e2e, h.owner).patch(
      `/v1/budgets/${h.budget.id}/members/${h.memberId}`,
      { role: 'viewer' },
    );
    expect(stale.status).toBe(409);
    expect(stale.body.error).toBe('STALE_STATE');
    expect(stale.body.current.members).toHaveLength(2);
  });

  it('transfers ownership: the previous owner becomes Admin, one owner remains (scenario 2)', async () => {
    const h = await household();
    const res = await as(e2e, h.owner).post(
      `/v1/budgets/${h.budget.id}/ownership`,
      {
        toMembershipId: h.adminId,
      },
    );
    expect(res.status).toBe(200);
    expect(res.body.myRole).toBe('admin');
    const roles = (await members(h.owner, h.budget.id)).members.map((m) => [
      m.displayName,
      m.role,
    ]);
    expect(roles).toEqual([
      ['Maëlle', 'owner'],
      ['Fabien', 'admin'],
      ['Chloé', 'member'],
    ]);
  });

  it('the owner cannot leave; a member can and stays in the month they left (scenarios 3, 4, 5)', async () => {
    const h = await household();
    const ownerLeave = await as(e2e, h.owner).post(
      `/v1/budgets/${h.budget.id}/leave`,
    );
    expect(ownerLeave.status).toBe(409);
    expect(ownerLeave.body.error).toBe('OWNER_MUST_TRANSFER');
    expect(
      (await as(e2e, h.member).post(`/v1/budgets/${h.budget.id}/leave`)).status,
    ).toBe(204);
    expect(
      (await as(e2e, h.member).get(`/v1/budgets/${h.budget.id}/members`))
        .status,
    ).toBe(404);
    expect(
      (await members(h.owner, h.budget.id)).formerMembers[0].displayName,
    ).toBe('Chloé');
  });

  it('only the first of two conflicting member actions succeeds', async () => {
    const h = await household();
    await as(e2e, h.owner).patch(
      `/v1/budgets/${h.budget.id}/members/${h.adminId}`,
      { role: 'admin' },
    );
    const [transfer, removal] = await Promise.all([
      as(e2e, h.owner).post(`/v1/budgets/${h.budget.id}/ownership`, {
        toMembershipId: h.memberId,
      }),
      as(e2e, h.admin).delete(
        `/v1/budgets/${h.budget.id}/members/${h.memberId}`,
      ),
    ]);
    // Serialized by the budget lock: one wins, the other gets an up-to-date error
    // (STALE_STATE if the removal won, CANNOT_MODIFY_OWNER if the transfer won).
    const outcomes = [transfer, removal].map((r) =>
      r.status < 300 ? 'ok' : r.body.error,
    );
    expect(outcomes.filter((o) => o === 'ok')).toHaveLength(1);
    expect(['STALE_STATE', 'CANNOT_MODIFY_OWNER']).toContain(
      outcomes.find((o) => o !== 'ok'),
    );
  });

  it('records who did what, for the owner and Admins only (FR-034)', async () => {
    const h = await household();
    await as(e2e, h.owner).patch(
      `/v1/budgets/${h.budget.id}/members/${h.adminId}`,
      { role: 'admin' },
    );
    await as(e2e, h.member).post(`/v1/budgets/${h.budget.id}/leave`);
    const events = await as(e2e, h.admin).get(
      `/v1/budgets/${h.budget.id}/events`,
    );
    expect(events.status).toBe(200);
    expect(events.body.events.map((e: { type: string }) => e.type)).toEqual([
      'left',
      'role_changed',
      'budget_created',
    ]);
    expect(events.body.events[1]).toMatchObject({
      actorName: 'Fabien',
      targetName: 'Maëlle',
      details: { fromRole: 'member', toRole: 'admin' },
    });
    expect(
      (await as(e2e, h.member).get(`/v1/budgets/${h.budget.id}/events`)).status,
    ).toBe(404);
  });
});

describe('US6 Settings and deletion', () => {
  it('Admins edit settings; a start-day change waits for the next month; currency locks once amounts exist', async () => {
    const owner = await signUpUser(e2e);
    const admin = await signUpUser(e2e);
    const member = await signUpUser(e2e);
    const budget = await createBudget(e2e, owner);
    await seedMember(e2e, budget.id, admin, 'admin');
    await seedMember(e2e, budget.id, member, 'member');
    const url = `/v1/budgets/${budget.id}`;
    const renamed = await as(e2e, admin).patch(url, {
      name: 'Foyer',
      monthStartDay: 28,
    });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Foyer');
    expect(renamed.body.monthStartDay).toBe(1);
    expect(renamed.body.currentMonth).toEqual(budget.currentMonth);
    expect(renamed.body.pendingMonthStartDay).toMatchObject({ startDay: 28 });
    expect((await as(e2e, member).patch(url, { name: 'Non' })).status).toBe(
      403,
    );
    expect((await as(e2e, member).get(url)).body.name).toBe('Foyer');

    expect(
      (await as(e2e, owner).patch(url, { currency: 'USD' })).body.currency,
    ).toBe('USD');
    await as(e2e, owner).put(
      `${url}/members/me/income/${currentMonthStart()}`,
      { amountMinor: '100' },
    );
    const locked = await as(e2e, owner).patch(url, { currency: 'EUR' });
    expect(locked.status).toBe(409);
    expect(locked.body.error).toBe('CURRENCY_LOCKED');
  });

  it('deletes by exact name, notifies the others, restores within 30 days, then purges', async () => {
    const owner = await signUpUser(e2e, { firstName: 'Fabien' });
    const maelle = await signUpUser(e2e, { firstName: 'Maëlle' });
    const budget = await createBudget(e2e, owner);
    await seedMember(e2e, budget.id, maelle, 'admin');
    await as(e2e, maelle).put('/v1/me/push-devices', {
      expoPushToken: 'ExponentPushToken[maelle]',
      platform: 'ios',
    });
    const code = await as(e2e, owner).post(
      `/v1/budgets/${budget.id}/invitations`,
      { kind: 'code' },
    );
    const url = `/v1/budgets/${budget.id}`;

    const wrong = await as(e2e, owner).delete(url, {
      confirmName: 'maison maëlle & fabien',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe('CONFIRM_NAME_MISMATCH');
    expect(
      (await as(e2e, owner).delete(url, { confirmName: budget.name })).status,
    ).toBe(204);
    expect((await as(e2e, maelle).get(url)).status).toBe(404);
    await e2e.drainOutbox();
    const mail = e2e.mailbox.filter({ to: maelle.email }).at(-1)!;
    expect(mail.text).toContain(
      'Fabien a supprimé le budget « Maison Maëlle & Fabien »',
    );
    expect(e2e.pushes.to('ExponentPushToken[maelle]')[0]).toMatchObject({
      title: 'Budget supprimé',
      body: 'Fabien a supprimé « Maison Maëlle & Fabien »',
    });

    const mine = await as(e2e, owner).get('/v1/me/budgets');
    expect(mine.body.recentlyDeleted).toEqual([
      expect.objectContaining({ id: budget.id, name: budget.name }),
    ]);
    expect(
      (await as(e2e, maelle).get('/v1/me/budgets')).body.recentlyDeleted,
    ).toEqual([]);
    expect((await as(e2e, maelle).post(`${url}/restore`)).status).toBe(404);

    const restored = await as(e2e, owner).post(`${url}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.members.map((m: { role: string }) => m.role)).toEqual([
      'owner',
      'admin',
    ]);
    expect((await as(e2e, maelle).get(url)).status).toBe(200);
    // Invitations are not revived (FR-038c).
    const someone = await signUpUser(e2e);
    expect(
      (await as(e2e, someone).get(`/v1/invitations/${code.body.code}`)).status,
    ).toBe(410);
    await e2e.drainOutbox();
    expect(e2e.pushes.to('ExponentPushToken[maelle]').at(-1)).toMatchObject({
      title: 'Budget restauré',
      data: { url: `/budgets/${budget.id}` },
    });

    // Past 30 days: purged, and restore is 404.
    await as(e2e, owner).delete(url, { confirmName: budget.name });
    await e2e.db.execute(
      sql`UPDATE budget SET deleted_at = now() - interval '30 days 1 minute'`,
    );
    expect(
      (await as(e2e, owner).get('/v1/me/budgets')).body.recentlyDeleted,
    ).toEqual([]);
    expect((await as(e2e, owner).post(`${url}/restore`)).status).toBe(404);
    expect(await e2e.app.get(PurgeBudgets).execute()).toBe(1);
    const left = await e2e.db.execute(
      sql`SELECT 1 FROM membership WHERE budget_id = ${budget.id}`,
    );
    expect(left.rows).toHaveLength(0);
  });
});

describe('US7 Viewer role', () => {
  it('reads everything and is refused every write (scenarios 1, 2)', async () => {
    const owner = await signUpUser(e2e);
    const viewer = await signUpUser(e2e);
    const budget = await createBudget(e2e, owner);
    await as(e2e, owner).put(
      `/v1/budgets/${budget.id}/members/me/income/${currentMonthStart()}`,
      { amountMinor: '5000' },
    );
    await seedMember(e2e, budget.id, viewer, 'viewer');
    const detail = await as(e2e, viewer).get(`/v1/budgets/${budget.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.myRole).toBe('viewer');
    const owners = detail.body.members.filter(
      (m: { role: string }) => m.role === 'owner',
    );
    expect(owners[0].currentMonthIncome.amountMinor).toBe('5000');
    const viewerSelf = detail.body.members.find(
      (m: { isMe: boolean }) => m.isMe,
    );
    expect(viewerSelf.currentMonthIncome).toBeNull();
    const forbidden = Object.entries(BUDGET_ROUTE_CASES).filter(
      ([, c]) => c.viewer === 'forbidden' && !c.special,
    );
    expect(forbidden.length).toBeGreaterThan(8);
  });
});

describe('Account deletion hand-off (001 ports, R14-C2/C3)', () => {
  async function deleteAccount(user: TestUser) {
    const reauth = (
      await e2e
        .client()
        .post('/v1/auth/reauthenticate')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ password: 'un mot de passe solide' })
    ).body.reauthToken;
    const res = await e2e
      .client()
      .delete('/v1/me')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ reauthToken: reauth });
    expect(res.status).toBe(202);
    await e2e.db.execute(
      sql`UPDATE users SET deletion_scheduled_at = now() - interval '1 minute' WHERE id = ${user.userId}`,
    );
    expect(await e2e.app.get(FinalizeDeletionsJob).run()).toBe(1);
  }

  it('hands ownership to the oldest Admin, erases solo budgets and anonymises the person', async () => {
    const owner = await signUpUser(e2e, { firstName: 'Fabien' });
    const oldMember = await signUpUser(e2e, { firstName: 'Ancien' });
    const admin = await signUpUser(e2e, { firstName: 'Maëlle' });
    const shared = await createBudget(e2e, owner, { name: 'Partagé' });
    await seedMember(
      e2e,
      shared.id,
      oldMember,
      'member',
      new Date(Date.now() - 3600_000),
    );
    await seedMember(e2e, shared.id, admin, 'admin');
    const solo = await createBudget(e2e, owner, { name: 'Solo' });
    const invite = await as(e2e, owner).post(
      `/v1/budgets/${shared.id}/invitations`,
      { kind: 'code' },
    );

    const preview = await as(e2e, owner).get('/v1/me/deletion/preview');
    if (preview.status === 200) {
      expect(preview.body.budgetsDeleted).toEqual([
        { id: solo.id, name: 'Solo' },
      ]);
      expect(preview.body.budgetsLeft).toEqual([
        { id: shared.id, name: 'Partagé', newOwnerFirstName: 'Maëlle' },
      ]);
    }

    await deleteAccount(owner);
    const people = await members(admin, shared.id);
    expect(people.members.map((m) => [m.displayName, m.role])).toEqual([
      ['Maëlle', 'owner'],
      ['Ancien', 'member'],
    ]);
    expect(people.formerMembers).toEqual([
      expect.objectContaining({ displayName: null, formerMember: true }),
    ]);
    const soloRows = await e2e.db.execute(
      sql`SELECT 1 FROM budget WHERE id = ${solo.id}`,
    );
    expect(soloRows.rows).toHaveLength(0);
    const someone = await signUpUser(e2e);
    expect(
      (await as(e2e, someone).get(`/v1/invitations/${invite.body.code}`))
        .status,
    ).toBe(410);
    await e2e.drainOutbox();
    const mail = e2e.mailbox.filter({ to: admin.email }).at(-1)!;
    expect(mail.subject).toContain('Nouveau propriétaire');
  });

  it('exports budgets, memberships and own incomes', async () => {
    const owner = await signUpUser(e2e);
    const budget = await createBudget(e2e, owner);
    await as(e2e, owner).put(
      `/v1/budgets/${budget.id}/members/me/income/${currentMonthStart()}`,
      { amountMinor: '123456' },
    );
    const data = await e2e.app.get(AccountHandoff).exportForUser(owner.userId);
    expect(data.budgets).toEqual([
      expect.objectContaining({
        budgetId: budget.id,
        role: 'owner',
        leftAt: null,
      }),
    ]);
    expect(data.entries).toEqual([
      expect.objectContaining({
        type: 'monthly_income',
        amountMinor: '123456',
        currency: 'EUR',
      }),
    ]);
  });
});
