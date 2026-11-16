import { sql } from 'drizzle-orm';
import {
  createBudget,
  currentMonthStart,
  seedMember,
} from '../support/budgets';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import { fakeProviders } from '../support/fake-providers';
import { as, signUpUser } from '../support/users';

let e2e: E2eApp;
beforeAll(async () => {
  e2e = await createE2eApp(fakeProviders().overrides);
});
beforeEach(() => e2e.reset());
afterAll(() => e2e.close());

describe('No amounts or emails in notifications and audit (FR-042, Principle III)', () => {
  it('keeps income digits and addresses out of every email, push and event', async () => {
    const owner = await signUpUser(e2e, { firstName: 'Fabien' });
    const member = await signUpUser(e2e, { firstName: 'Maëlle' });
    const budget = await createBudget(e2e, owner);
    const memberId = await seedMember(e2e, budget.id, member, 'member');
    await as(e2e, member).put('/v1/me/push-devices', {
      expoPushToken: 'ExponentPushToken[m]',
      platform: 'ios',
    });
    const month = currentMonthStart();
    await as(e2e, owner).put(
      `/v1/budgets/${budget.id}/members/me/income/${month}`,
      {
        amountMinor: '7654321',
      },
    );
    await as(e2e, member).put(
      `/v1/budgets/${budget.id}/members/me/income/${month}`,
      {
        amountMinor: '7654321',
      },
    );
    e2e.mailbox.clear();

    await as(e2e, owner).post(`/v1/budgets/${budget.id}/invitations`, {
      kind: 'email',
      email: 'guest@example.com',
    });
    await as(e2e, owner).patch(`/v1/budgets/${budget.id}/members/${memberId}`, {
      role: 'admin',
    });
    await as(e2e, owner).delete(`/v1/budgets/${budget.id}`, {
      confirmName: budget.name,
    });
    await as(e2e, owner).post(`/v1/budgets/${budget.id}/restore`);
    await as(e2e, owner).delete(`/v1/budgets/${budget.id}/members/${memberId}`);
    await e2e.drainOutbox();

    const mails = e2e.mailbox.filter({});
    expect(mails.length).toBeGreaterThanOrEqual(3);
    const texts = [
      ...mails.map((m) => `${m.subject}\n${m.text}\n${m.html}`),
      ...e2e.pushes.sent.map(
        (p) => `${p.title}\n${p.body}\n${JSON.stringify(p.data ?? {})}`,
      ),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/76\s?543|7654321|€/);
      expect(text).not.toContain(owner.email);
      expect(text).not.toContain(member.email);
    }
    const events = await e2e.db.execute<{ details: unknown }>(
      sql`SELECT details FROM membership_event`,
    );
    for (const { details } of events.rows) {
      const json = JSON.stringify(details);
      expect(json).not.toContain('7654321');
      expect(json).not.toContain('@');
    }
  });
});
