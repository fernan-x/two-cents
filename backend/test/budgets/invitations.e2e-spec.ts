import { sql } from 'drizzle-orm';
import {
  createBudget,
  currentMonthStart,
  seedMember,
} from '../support/budgets';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import { fakeProviders } from '../support/fake-providers';
import { DAY_MS } from '../support/fakes';
import { as, signUpUser, type TestUser } from '../support/users';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

const codeOf = (created: { code: string }) => created.code;

async function setup() {
  const fabien = await signUpUser(e2e, { firstName: 'Fabien' });
  const budget = await createBudget(e2e, fabien);
  return { fabien, budget };
}

describe('US2 Invite the partner (owner side)', () => {
  it('emails a link and the code, without amounts (scenario 1, FR-042)', async () => {
    const { fabien, budget } = await setup();
    await as(e2e, fabien).put(
      `/v1/budgets/${budget.id}/members/me/income/${currentMonthStart()}`,
      { amountMinor: '987654' },
    );
    const res = await as(e2e, fabien).post(
      `/v1/budgets/${budget.id}/invitations`,
      {
        kind: 'email',
        email: 'Partner@Example.com',
      },
    );
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      kind: 'email',
      email: 'partner@example.com',
      role: 'member',
      status: 'pending',
      invitedBy: 'Fabien',
      resent: false,
    });
    expect(res.body.code).toMatch(/^[0-9A-Z]{3}-[0-9A-Z]{3}$/);
    expect(res.body.link).toBe(`https://links.test/i/${res.body.code}`);

    await e2e.drainOutbox();
    const mail = e2e.mailbox.filter({ to: 'partner@example.com' }).at(-1)!;
    expect(mail).toBeDefined();
    const text = `${mail.subject}\n${mail.text}\n${mail.html}`;
    expect(text).toContain('Maison Maëlle &');
    expect(text).toContain(res.body.code);
    expect(text).toContain(`/i/${res.body.code}`);
    expect(text).not.toMatch(/9\s?876|987654|€/);
    // Only the HMAC is stored.
    const rows = await e2e.db.execute<{ code_hash: Buffer }>(
      sql`SELECT code_hash FROM invitation`,
    );
    expect(rows.rows[0].code_hash.toString('utf8')).not.toContain(
      res.body.code.replace('-', ''),
    );
  });

  it('pushes to an invitee who already has an account (scenario 2)', async () => {
    const { fabien, budget } = await setup();
    const maelle = await signUpUser(e2e, { firstName: 'Maëlle' });
    const token = 'ExponentPushToken[maelle-device]';
    expect(
      (
        await as(e2e, maelle).put('/v1/me/push-devices', {
          expoPushToken: token,
          platform: 'ios',
        })
      ).status,
    ).toBe(204);
    const res = await as(e2e, fabien).post(
      `/v1/budgets/${budget.id}/invitations`,
      {
        kind: 'email',
        email: maelle.email,
      },
    );
    await e2e.drainOutbox();
    expect(e2e.pushes.to(token)).toEqual([
      expect.objectContaining({
        title: 'Invitation de Fabien',
        body: 'Rejoignez « Maison Maëlle & Fabien » sur Two Cents',
        data: { url: `/i/${res.body.code}` },
      }),
    ]);
    expect(
      e2e.mailbox
        .filter({ to: maelle.email })
        .filter((m) => m.subject.includes('vous invite')),
    ).toHaveLength(1);
  });

  it('re-inviting a pending email resends it; a member email is refused (FR-013, FR-014)', async () => {
    const { fabien, budget } = await setup();
    const first = await as(e2e, fabien).post(
      `/v1/budgets/${budget.id}/invitations`,
      {
        kind: 'email',
        email: 'p@example.com',
      },
    );
    await e2e.db.execute(
      sql`UPDATE invitation SET last_sent_at = last_sent_at - interval '2 days', expires_at = expires_at - interval '2 days'`,
    );
    const before = (
      await as(e2e, fabien).get(`/v1/budgets/${budget.id}/invitations`)
    ).body.invitations[0].expiresAt as string;
    const again = await as(e2e, fabien).post(
      `/v1/budgets/${budget.id}/invitations`,
      {
        kind: 'email',
        email: 'p@example.com',
      },
    );
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect(again.body.resent).toBe(true);
    expect(new Date(again.body.expiresAt).getTime()).toBeGreaterThan(
      new Date(before).getTime() + DAY_MS,
    );
    expect(first.body.code).not.toBe(again.body.code);
    const member = await as(e2e, fabien).post(
      `/v1/budgets/${budget.id}/invitations`,
      {
        kind: 'email',
        email: fabien.email,
      },
    );
    expect(member.status).toBe(409);
    expect(member.body.error).toBe('ALREADY_MEMBER');
  });

  it('refuses a 7th person, members plus pending invitations (FR-023)', async () => {
    const { fabien, budget } = await setup();
    for (let i = 0; i < 5; i++)
      expect(
        (
          await as(e2e, fabien).post(`/v1/budgets/${budget.id}/invitations`, {
            kind: 'code',
          })
        ).status,
      ).toBe(201);
    const full = await as(e2e, fabien).post(
      `/v1/budgets/${budget.id}/invitations`,
      {
        kind: 'email',
        email: 'sixth@example.com',
      },
    );
    expect(full.status).toBe(409);
    expect(full.body.error).toBe('BUDGET_FULL');
  });

  it('requires a confirmed email to invite (001 FR-011)', async () => {
    const unconfirmed = await signUpUser(e2e, { confirmed: false });
    const budget = await createBudget(e2e, unconfirmed);
    const res = await as(e2e, unconfirmed).post(
      `/v1/budgets/${budget.id}/invitations`,
      {
        kind: 'code',
      },
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('EMAIL_NOT_CONFIRMED');
  });
});

describe('US2 Join (invitee side)', () => {
  async function codeInvite(
    owner: TestUser,
    budgetId: string,
    role = 'member',
  ) {
    const res = await as(e2e, owner).post(
      `/v1/budgets/${budgetId}/invitations`,
      {
        kind: 'code',
        role,
      },
    );
    return codeOf(res.body);
  }

  it('previews, accepts and lands in the budget with the inviter role (scenarios 4, 5, 9)', async () => {
    const { fabien, budget } = await setup();
    const code = await codeInvite(fabien, budget.id, 'admin');
    const maelle = await signUpUser(e2e, { firstName: 'Maëlle' });
    const preview = await as(e2e, maelle).get(
      `/v1/invitations/${code.toLowerCase()}`,
    );
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      budgetName: 'Maison Maëlle & Fabien',
      inviterName: 'Fabien',
      role: 'admin',
      memberCount: 1,
    });
    const accept = await as(e2e, maelle).post(`/v1/invitations/${code}/accept`);
    expect(accept.status).toBe(200);
    expect(accept.body).toMatchObject({
      budgetId: budget.id,
      role: 'admin',
      askIncome: true,
    });
    const view = await as(e2e, maelle).get(`/v1/budgets/${budget.id}`);
    expect(view.status).toBe(200);
    expect(view.body.memberCount).toBe(2);
    // Single use.
    const other = await signUpUser(e2e);
    const reuse = await as(e2e, other).get(`/v1/invitations/${code}`);
    expect(reuse.status).toBe(410);
    expect(reuse.body).toEqual({
      error: 'INVITATION_USED',
      inviterName: 'Fabien',
    });
  });

  it('only one of two concurrent acceptances wins', async () => {
    const { fabien, budget } = await setup();
    const code = await codeInvite(fabien, budget.id);
    const a = await signUpUser(e2e);
    const b = await signUpUser(e2e);
    const results = await Promise.all([
      as(e2e, a).post(`/v1/invitations/${code}/accept`),
      as(e2e, b).post(`/v1/invitations/${code}/accept`),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);
  });

  it('an email invitation is only for that address (scenario 8, FR-010)', async () => {
    const { fabien, budget } = await setup();
    const res = await as(e2e, fabien).post(
      `/v1/budgets/${budget.id}/invitations`,
      {
        kind: 'email',
        email: 'maelle@example.com',
      },
    );
    const other = await signUpUser(e2e, { email: 'other@example.com' });
    const preview = await as(e2e, other).get(
      `/v1/invitations/${res.body.code}`,
    );
    expect(preview.status).toBe(403);
    expect(preview.body).toEqual({
      error: 'INVITATION_WRONG_EMAIL',
      invitedEmailMasked: 'm•••@example.com',
    });
    const maelle = await signUpUser(e2e, { email: 'maelle@example.com' });
    expect(
      (await as(e2e, maelle).post(`/v1/invitations/${res.body.code}/accept`))
        .status,
    ).toBe(200);
  });

  it('a current member opening a code is told so and the code is not consumed', async () => {
    const { fabien, budget } = await setup();
    const code = await codeInvite(fabien, budget.id);
    const res = await as(e2e, fabien).get(`/v1/invitations/${code}`);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'ALREADY_MEMBER', budgetId: budget.id });
    const maelle = await signUpUser(e2e);
    expect(
      (await as(e2e, maelle).post(`/v1/invitations/${code}/accept`)).status,
    ).toBe(200);
  });

  it('declining invalidates it and the owner sees it as declined (scenario 7)', async () => {
    const { fabien, budget } = await setup();
    const code = await codeInvite(fabien, budget.id);
    const maelle = await signUpUser(e2e);
    expect(
      (await as(e2e, maelle).post(`/v1/invitations/${code}/decline`)).status,
    ).toBe(204);
    const again = await as(e2e, maelle).post(`/v1/invitations/${code}/accept`);
    expect(again.body.error).toBe('INVITATION_DECLINED');
    const list = await as(e2e, fabien).get(
      `/v1/budgets/${budget.id}/invitations?status=all`,
    );
    expect(list.body.invitations[0].status).toBe('declined');
    expect((await as(e2e, maelle).get(`/v1/budgets/${budget.id}`)).status).toBe(
      404,
    );
  });

  it('a viewer is not asked for income; a former member rejoins as the same person', async () => {
    const { fabien, budget } = await setup();
    const viewer = await signUpUser(e2e);
    const code = await codeInvite(fabien, budget.id, 'viewer');
    const accept = await as(e2e, viewer).post(`/v1/invitations/${code}/accept`);
    expect(accept.body.askIncome).toBe(false);
    await as(e2e, viewer).post(`/v1/budgets/${budget.id}/leave`);
    const back = await codeInvite(fabien, budget.id);
    expect(
      (await as(e2e, viewer).post(`/v1/invitations/${back}/accept`)).status,
    ).toBe(200);
    const rows = await e2e.db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM membership WHERE user_id = ${viewer.userId}`,
    );
    expect(rows.rows[0].n).toBe(2);
  });

  it('blocks an account after 5 wrong codes in 15 minutes (FR-022)', async () => {
    const guesser = await signUpUser(e2e);
    for (let i = 0; i < 5; i++) {
      const res = await as(e2e, guesser).get('/v1/invitations/ZZZZZ' + i);
      expect(res.status).toBe(404);
    }
    const blocked = await as(e2e, guesser).get('/v1/invitations/ABC123');
    expect(blocked.status).toBe(429);
    expect(blocked.body.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('requires a confirmed email to join', async () => {
    const { fabien, budget } = await setup();
    const code = await codeInvite(fabien, budget.id);
    const unconfirmed = await signUpUser(e2e, { confirmed: false });
    const res = await as(e2e, unconfirmed).post(
      `/v1/invitations/${code}/accept`,
    );
    expect(res.body.error).toBe('EMAIL_NOT_CONFIRMED');
  });
});

describe('US2 Income (FR-024, FR-025, FR-025a)', () => {
  it('is visible to everyone, viewers included; the reminder goes away', async () => {
    const { fabien, budget } = await setup();
    const viewer = await signUpUser(e2e);
    await seedMember(e2e, budget.id, viewer, 'viewer');
    const month = currentMonthStart();
    expect(
      (await as(e2e, fabien).get(`/v1/budgets/${budget.id}`)).body
        .myIncomeMissing,
    ).toBe(true);
    const put = await as(e2e, fabien).put(
      `/v1/budgets/${budget.id}/members/me/income/${month}`,
      { amountMinor: '245050' },
    );
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ amountMinor: '245050', currency: 'EUR' });
    const seen = await as(e2e, viewer).get(`/v1/budgets/${budget.id}/members`);
    const owner = seen.body.members.find(
      (m: { role: string }) => m.role === 'owner',
    );
    expect(owner.currentMonthIncome).toEqual({
      amountMinor: '245050',
      currency: 'EUR',
    });
    const detail = await as(e2e, fabien).get(`/v1/budgets/${budget.id}`);
    expect(detail.body.myIncomeMissing).toBe(false);
    expect(detail.body.currencyLocked).toBe(true);
    const viewerDetail = await as(e2e, viewer).get(`/v1/budgets/${budget.id}`);
    expect(viewerDetail.body.myIncomeMissing).toBe(false);
  });

  it('refuses malformed amounts and months that are not budget months', async () => {
    const { fabien, budget } = await setup();
    const url = (m: string) =>
      `/v1/budgets/${budget.id}/members/me/income/${m}`;
    expect(
      (
        await as(e2e, fabien).put(url(currentMonthStart()), {
          amountMinor: '12.5',
        })
      ).status,
    ).toBe(400);
    const notStart = await as(e2e, fabien).put(url('2026-11-02'), {
      amountMinor: '100',
    });
    expect(notStart.body.error).toBe('INVALID_MONTH');
    const future = await as(e2e, fabien).put(url('2099-01-01'), {
      amountMinor: '100',
    });
    expect(future.body.error).toBe('INVALID_MONTH');
  });
});

describe('Install page (FR-016)', () => {
  it('shows the code and store links, no budget data, and is rate-limited per IP', async () => {
    const { fabien, budget } = await setup();
    const res = await as(e2e, fabien).post(
      `/v1/budgets/${budget.id}/invitations`,
      { kind: 'code' },
    );
    const ip = '10.9.9.9';
    const page = await e2e.client(ip).get(`/i/${res.body.code}`);
    expect(page.status).toBe(200);
    expect(page.headers['content-type']).toContain('text/html');
    expect(page.text).toContain(res.body.code);
    expect(page.text).toContain('App Store');
    expect(page.text).not.toContain('Maison');
    expect(page.text).not.toContain('Fabien');
    for (let i = 0; i < 29; i++) await e2e.client(ip).get('/i/ABC-123');
    expect((await e2e.client(ip).get('/i/ABC-123')).status).toBe(429);
  });
});
