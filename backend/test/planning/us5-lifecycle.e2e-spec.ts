import { sql } from 'drizzle-orm';
import { seedMember } from '../support/budgets';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addIncome,
  addLine,
  createMonth,
  type Household,
  monthUrl,
  seedHousehold,
  shared,
} from '../support/planning';
import { as, signUpUser } from '../support/users';

/** US5: agree on the plan, track changes, close and reopen. */
describe('US5 lifecycle and history', () => {
  let e2e: E2eApp;
  let h: Household;
  const NOV = '2026-11-01';
  const status = (user = h.maelle, action: string) =>
    as(e2e, user).post(monthUrl(h, NOV, '/status'), { action });

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    await createMonth(e2e, h, NOV);
  });

  it('activates once; changes after activation show in the history', async () => {
    const detail = await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'Courses', { [h.m]: '10000', [h.f]: '18000' }),
    );
    const activated = await status(h.maelle, 'activate');
    expect(activated.status).toBe(200);
    expect(activated.body.month.status).toBe('active');
    expect(activated.body.can.changeStatus).toEqual(['close']);
    const again = await status(h.maelle, 'activate');
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('INVALID_TRANSITION');

    const line = activated.body.lines[0];
    await as(e2e, h.fabien).patch(monthUrl(h, NOV, `/lines/${line.id}`), {
      expectedVersion: line.version,
      scope: 'this_month_only',
      amount: {
        entry: 'shares',
        shares: [
          { membershipId: h.m, amountMinor: '10000' },
          { membershipId: h.f, amountMinor: '20000' },
        ],
      },
    });
    const history = await as(e2e, h.victor).get(monthUrl(h, NOV, '/history'));
    expect(history.status).toBe(200);
    expect(history.body.changes[0]).toMatchObject({
      actor: { membershipId: h.f, displayName: 'Fabien', formerMember: false },
      cause: 'user',
      entity: 'line',
      action: 'updated',
      private: false,
      label: 'Courses',
    });
    expect(history.body.changes[0].changes).toEqual(
      expect.arrayContaining([
        { field: 'totalMinor', old: '28000', new: '30000' },
      ]),
    );
    // Without `all`, Draft-time changes are hidden; with it, the creation shows up.
    expect(
      history.body.changes.map((c: { action: string }) => c.action),
    ).toEqual(['updated', 'activated']);
    const all = await as(e2e, h.victor).get(
      monthUrl(h, NOV, '/history?all=true'),
    );
    expect(all.body.changes.map((c: { action: string }) => c.action)).toEqual([
      'updated',
      'activated',
      'created',
      'created',
    ]);
    expect(detail.lines).toHaveLength(1);
  });

  it('refuses activation while lines need review', async () => {
    const detail = await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'Loyer', { [h.f]: '100' }),
    );
    await e2e.db.execute(
      sql`UPDATE budget_line SET needs_review = true WHERE id = ${detail.lines[0].id}`,
    );
    const res = await status(h.fabien, 'activate');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'LINES_NEED_REVIEW',
      lineIds: [detail.lines[0].id],
    });
  });

  it('closing freezes the month; only the owner and admins reopen', async () => {
    await addIncome(e2e, h, h.maelle, NOV, '200000');
    const detail = await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'Loyer', { [h.m]: '95000', [h.f]: '95000' }),
    );
    const line = detail.lines[0];
    await status(h.maelle, 'activate');
    const closed = await status(h.maelle, 'close');
    expect(closed.body.month.status).toBe('closed');
    expect(closed.body.actuals).toBeNull();
    expect(closed.body.can).toEqual({ editShared: false, changeStatus: [] });
    expect(closed.body.lines[0].editable).toBe(false);
    const frozen = closed.body.summary;

    const writes = [
      as(e2e, h.fabien).post(
        monthUrl(h, NOV, '/lines'),
        shared('recurring_shared', 'x', { [h.f]: '1' }),
      ),
      as(e2e, h.fabien).patch(monthUrl(h, NOV, `/lines/${line.id}`), {
        expectedVersion: line.version,
        label: 'x',
      }),
      as(e2e, h.fabien).delete(
        monthUrl(h, NOV, `/lines/${line.id}?expectedVersion=${line.version}`),
      ),
      as(e2e, h.fabien).put(monthUrl(h, NOV, '/lines/order'), {
        group: 'recurring_shared',
        lineIds: [line.id],
      }),
      as(e2e, h.fabien).post(monthUrl(h, NOV, '/incomes'), {
        amountMinor: '1',
      }),
      as(e2e, h.maelle).post(monthUrl(h, NOV, '/incomes/confirm')),
      as(e2e, h.maelle).put(
        `/v1/budgets/${h.budgetId}/members/me/income/${NOV}`,
        { amountMinor: '1' },
      ),
    ];
    for (const res of await Promise.all(writes)) {
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('MONTH_CLOSED');
    }
    // The frozen summary does not move even if lines were changed behind the API's back.
    await e2e.db.transaction(async (tx) => {
      await tx.execute(
        sql`UPDATE budget_line_share SET amount_minor = 0 WHERE line_id = ${line.id}`,
      );
      await tx.execute(
        sql`UPDATE budget_line SET total_minor = 0 WHERE id = ${line.id}`,
      );
    });
    expect(
      (await as(e2e, h.fabien).get(monthUrl(h, NOV))).body.summary,
    ).toEqual(frozen);

    const byMember = await status(h.maelle, 'reopen');
    expect(byMember.status).toBe(403);
    expect(byMember.body.error).toBe('FORBIDDEN');

    const admin = await signUpUser(e2e, { firstName: 'Alex' });
    await seedMember(e2e, h.budgetId, admin, 'admin');
    const reopened = await status(admin, 'reopen');
    expect(reopened.status).toBe(200);
    expect(reopened.body.month.status).toBe('active');
    const edit = await as(e2e, h.fabien).post(
      monthUrl(h, NOV, '/lines'),
      shared('recurring_shared', 'Gaz', { [h.f]: '1' }),
    );
    expect(edit.status).toBe(201);
  });

  it('hides private line details from others in the history', async () => {
    await addLine(e2e, h, h.maelle, NOV, {
      group: 'personal',
      label: 'Psy',
      ownerMembershipId: h.m,
      isPrivate: true,
      amount: { entry: 'total', totalMinor: '6000' },
    });
    const forFabien = await as(e2e, h.fabien).get(
      monthUrl(h, NOV, '/history?all=true'),
    );
    const line = forFabien.body.changes.find(
      (c: { entity: string }) => c.entity === 'line',
    );
    expect(line).toMatchObject({ private: true, label: null, changes: [] });
    const forMaelle = await as(e2e, h.maelle).get(
      monthUrl(h, NOV, '/history?all=true'),
    );
    expect(
      forMaelle.body.changes.find(
        (c: { entity: string }) => c.entity === 'line',
      ),
    ).toMatchObject({
      private: false,
      label: 'Psy',
    });
  });
});
