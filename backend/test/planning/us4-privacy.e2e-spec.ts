import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addLine,
  createMonth,
  type Household,
  monthUrl,
  seedHousehold,
  shared,
} from '../support/planning';
import { as } from '../support/users';

/** US4: personal lines are read-only for others; private lines are only a sum for them (FR-018, FR-019, R10). */
describe('US4 privacy', () => {
  let e2e: E2eApp;
  let h: Household;
  const NOV = '2026-11-01';
  const SECRET_LABELS = ['Psy', 'Cadeau surprise'];

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    await createMonth(e2e, h, NOV);
  });

  const privateLine = (
    label: string,
    totalMinor: string,
    kind = 'expense',
  ) => ({
    group: 'personal',
    kind,
    label,
    ownerMembershipId: h.m,
    isPrivate: true,
    amount: { entry: 'total', totalMinor },
  });

  /** No private label, and no line or sub-item carrying the private amounts, in a JSON body. */
  function expectNoLeak(body: unknown) {
    const json = JSON.stringify(body);
    for (const label of SECRET_LABELS) expect(json).not.toContain(label);
    const lines =
      (body as { lines?: Array<{ totalMinor: string }> }).lines ?? [];
    expect(
      lines.filter((l) => l.totalMinor === '6000' || l.totalMinor === '4000'),
    ).toEqual([]);
  }

  it('never sends private lines to anyone but their owner, everywhere', async () => {
    await addLine(e2e, h, h.maelle, NOV, privateLine('Psy', '6000'));
    const mine = await addLine(
      e2e,
      h,
      h.maelle,
      NOV,
      privateLine('Cadeau surprise', '4000', 'savings'),
    );
    expect(
      mine.lines.filter((l: { isPrivate: boolean }) => l.isPrivate),
    ).toHaveLength(2);
    expect(mine.privateAggregates).toEqual([]);

    // Fabien writes something: his own write responses must not leak either.
    const write = await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'Loyer', { [h.f]: '100' }),
    );
    expectNoLeak(write);

    await as(e2e, h.maelle).post(`/v1/budgets/${h.budgetId}/templates`, {
      name: 'Maëlle',
      fromMonthStart: NOV,
    });
    for (const user of [h.fabien, h.victor]) {
      const month = await as(e2e, user).get(monthUrl(h, NOV));
      expectNoLeak(month.body);
      expect(month.body.privateAggregates).toEqual([
        {
          membershipId: h.m,
          totalMinor: '10000',
          savingsMinor: '4000',
          count: 2,
        },
      ]);
      for (const path of ['/history', '/history?all=true'])
        expectNoLeak((await as(e2e, user).get(monthUrl(h, NOV, path))).body);
      expectNoLeak(
        (await as(e2e, user).get(`/v1/budgets/${h.budgetId}/templates`)).body,
      );
      expectNoLeak(
        (await as(e2e, user).get(`/v1/budgets/${h.budgetId}/months`)).body,
      );
    }

    // Everyone sees the same summary, private lines included in Maëlle's DI.
    const forFabien = (await as(e2e, h.fabien).get(monthUrl(h, NOV))).body
      .summary;
    const forMaelle = (await as(e2e, h.maelle).get(monthUrl(h, NOV))).body
      .summary;
    expect(forFabien).toEqual(forMaelle);
    expect(
      forFabien.members.find(
        (m: { membershipId: string }) => m.membershipId === h.m,
      ),
    ).toMatchObject({
      diMinor: '10000',
      savingsMinor: '4000',
    });
  });

  it('others cannot touch a private line, nor even find it', async () => {
    const created = await addLine(
      e2e,
      h,
      h.maelle,
      NOV,
      privateLine('Psy', '6000'),
    );
    const line = created.lines[0];
    const res = await as(e2e, h.fabien).patch(
      monthUrl(h, NOV, `/lines/${line.id}`),
      {
        expectedVersion: line.version,
        label: 'x',
      },
    );
    expect(res.status).toBe(404);
  });

  it('only personal lines can be private; leaving the personal group drops privacy', async () => {
    const shared = await as(e2e, h.fabien).post(monthUrl(h, NOV, '/lines'), {
      group: 'recurring_shared',
      label: 'Loyer',
      isPrivate: true,
      split: { mode: 'equal' },
      amount: { entry: 'total', totalMinor: '100' },
    });
    expect(shared.status).toBe(400);

    const created = await addLine(
      e2e,
      h,
      h.maelle,
      NOV,
      privateLine('Psy', '6000'),
    );
    const line = created.lines[0];
    const moved = await as(e2e, h.maelle).patch(
      monthUrl(h, NOV, `/lines/${line.id}`),
      {
        expectedVersion: line.version,
        group: 'one_off_shared',
        split: { mode: 'equal' },
      },
    );
    expect(moved.status).toBe(200);
    expect(moved.body.lines[0]).toMatchObject({
      group: 'one_off_shared',
      isPrivate: false,
      ownerMembershipId: null,
    });
  });
});
