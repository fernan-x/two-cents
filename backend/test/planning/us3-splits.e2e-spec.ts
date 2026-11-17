import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addIncome,
  addLine,
  createMonth,
  type Household,
  monthUrl,
  seedHousehold,
} from '../support/planning';
import { as } from '../support/users';

type Share = { membershipId: string; amountMinor: string };
const sharesOf = (line: { shares: Share[] }) =>
  Object.fromEntries(line.shares.map((s) => [s.membershipId, s.amountMinor]));

/** US3: split modes, periodic amounts, recompute on income change, sub-items, categories. */
describe('US3 splits and periodic amounts', () => {
  let e2e: E2eApp;
  let h: Household;
  const NOV = '2026-11-01';

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    await createMonth(e2e, h, NOV);
  });

  const total = (totalMinor: string) => ({ entry: 'total', totalMinor });

  it('proportional, then equal, then one payer', async () => {
    await addIncome(e2e, h, h.maelle, NOV, '200000');
    await addIncome(e2e, h, h.fabien, NOV, '300000');
    const created = await addLine(e2e, h, h.fabien, NOV, {
      group: 'recurring_shared',
      label: 'Électricité',
      split: { mode: 'proportional' },
      amount: total('50000'),
    });
    const line = created.lines[0];
    expect(sharesOf(line)).toEqual({ [h.m]: '20000', [h.f]: '30000' });

    const equal = await as(e2e, h.maelle).patch(
      monthUrl(h, NOV, `/lines/${line.id}`),
      {
        expectedVersion: line.version,
        scope: 'this_month_only',
        split: { mode: 'equal' },
      },
    );
    expect(equal.status).toBe(200);
    expect(sharesOf(equal.body.lines[0])).toEqual({
      [h.m]: '25000',
      [h.f]: '25000',
    });

    const payer = await as(e2e, h.maelle).patch(
      monthUrl(h, NOV, `/lines/${line.id}`),
      {
        expectedVersion: equal.body.lines[0].version,
        scope: 'this_month_only',
        split: { mode: 'one_payer', payerMembershipId: h.f },
        amount: total('6000'),
      },
    );
    expect(payer.body.lines[0]).toMatchObject({
      splitMode: 'one_payer',
      payerMembershipId: h.f,
      totalMinor: '6000',
    });
    expect(sharesOf(payer.body.lines[0])).toEqual({
      [h.m]: '0',
      [h.f]: '6000',
    });
  });

  it('splits odd cents deterministically', async () => {
    const res = await addLine(e2e, h, h.fabien, NOV, {
      group: 'one_off_shared',
      label: 'Location ponceuse',
      split: { mode: 'equal' },
      amount: total('1001'),
    });
    // Ties go to the member who joined first (the owner here, then Maëlle).
    const shares = sharesOf(res.lines[0]);
    expect(BigInt(shares[h.f]) + BigInt(shares[h.m])).toBe(1001n);
    expect([shares[h.f], shares[h.m]].sort()).toEqual(['500', '501']);
  });

  it('stores periodic amounts with their formula', async () => {
    const perYear = await addLine(e2e, h, h.fabien, NOV, {
      group: 'recurring_shared',
      label: 'Assurance auto',
      split: { mode: 'equal' },
      amount: {
        entry: 'total',
        formula: { kind: 'per_year', baseMinor: '8000', factor: 1 },
      },
    });
    expect(perYear.lines[0]).toMatchObject({
      totalMinor: '667',
      formula: { kind: 'per_year', baseMinor: '8000', factor: 1 },
    });
    const times = await addLine(e2e, h, h.fabien, NOV, {
      group: 'personal',
      label: 'Cours de guitare',
      ownerMembershipId: h.f,
      amount: {
        entry: 'total',
        formula: { kind: 'times', baseMinor: '4700', factor: 2 },
      },
    });
    expect(
      times.lines.find((l: { label: string }) => l.label === 'Cours de guitare')
        .totalMinor,
    ).toBe('9400');
  });

  it('recomputes proportional lines when an income changes, and flags them without income', async () => {
    const inc = await addIncome(e2e, h, h.maelle, NOV, '200000');
    await addIncome(e2e, h, h.fabien, NOV, '300000');
    await addLine(e2e, h, h.fabien, NOV, {
      group: 'recurring_shared',
      label: 'Courses',
      split: { mode: 'proportional' },
      amount: total('50000'),
    });
    const income = inc.incomes.find(
      (i: { membershipId: string }) => i.membershipId === h.m,
    );
    const raised = await as(e2e, h.maelle).patch(
      monthUrl(h, NOV, `/incomes/${income.id}`),
      {
        expectedVersion: income.version,
        amountMinor: '300000',
      },
    );
    expect(sharesOf(raised.body.lines[0])).toEqual({
      [h.m]: '25000',
      [h.f]: '25000',
    });
    const history = await e2e.db.execute<{ cause: string }>(
      `SELECT cause FROM month_change WHERE entity = 'line' AND action = 'updated'`,
    );
    expect(history.rows.map((r) => r.cause)).toEqual(['recompute']);

    // Remove every income, Maëlle's first: the line follows Fabien's income alone, then keeps
    // those last valid shares and asks for incomes.
    const ordered = [...raised.body.incomes].sort(
      (a: { membershipId: string }) => (a.membershipId === h.m ? -1 : 1),
    );
    for (const i of ordered) {
      const owner = i.membershipId === h.m ? h.maelle : h.fabien;
      await as(e2e, owner).delete(
        monthUrl(h, NOV, `/incomes/${i.id}?expectedVersion=${i.version}`),
      );
    }
    const after = await as(e2e, h.fabien).get(monthUrl(h, NOV));
    expect(after.body.lines[0]).toMatchObject({ needsIncome: true });
    expect(sharesOf(after.body.lines[0])).toEqual({
      [h.m]: '0',
      [h.f]: '50000',
    });
    expect(after.body.flags.linesNeedIncome).toEqual([after.body.lines[0].id]);

    const refused = await as(e2e, h.fabien).post(monthUrl(h, NOV, '/lines'), {
      group: 'recurring_shared',
      label: 'Gaz',
      split: { mode: 'proportional' },
      amount: total('100'),
    });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toBe('NO_INCOME_FOR_PROPORTIONAL');
  });

  it('envelope sub-items may not exceed the line total', async () => {
    const ok = await addLine(e2e, h, h.fabien, NOV, {
      group: 'recurring_shared',
      label: 'Chats',
      isEnvelope: true,
      subItems: [
        { label: 'Friandises', amountMinor: '2000' },
        { label: 'Litière', amountMinor: '3000' },
        { label: 'Foin' },
      ],
      split: { mode: 'equal' },
      amount: total('9000'),
    });
    expect(ok.lines[0].subItems.map((s: { label: string }) => s.label)).toEqual(
      ['Friandises', 'Litière', 'Foin'],
    );
    const tooMuch = await as(e2e, h.fabien).post(monthUrl(h, NOV, '/lines'), {
      group: 'recurring_shared',
      label: 'Chiens',
      isEnvelope: true,
      subItems: [{ label: 'Croquettes', amountMinor: '9001' }],
      split: { mode: 'equal' },
      amount: total('9000'),
    });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.error).toBe('SUB_ITEMS_EXCEED_TOTAL');
  });

  it('manages categories; deleting one leaves its lines uncategorized', async () => {
    const url = `/v1/budgets/${h.budgetId}/categories`;
    const list = await as(e2e, h.victor).get(url);
    expect(
      list.body.categories.map((c: { systemKey: string }) => c.systemKey),
    ).toEqual([
      'housing',
      'food',
      'transport',
      'pets',
      'leisure',
      'health',
      'subscriptions',
      'savings',
      'gifts',
      'other',
    ]);
    const diy = await as(e2e, h.maelle).post(url, { name: 'Bricolage' });
    expect(diy.status).toBe(201);
    expect(diy.body).toMatchObject({
      systemKey: null,
      name: 'Bricolage',
      position: 10,
    });
    const renamed = await as(e2e, h.maelle).patch(`${url}/${diy.body.id}`, {
      name: 'Travaux',
    });
    expect(renamed.body.name).toBe('Travaux');

    const line = await addLine(e2e, h, h.fabien, NOV, {
      group: 'one_off_shared',
      label: 'Ponceuse',
      categoryId: diy.body.id,
      split: { mode: 'equal' },
      amount: total('4000'),
    });
    expect(line.lines[0].categoryId).toBe(diy.body.id);
    expect(
      (await as(e2e, h.fabien).delete(`${url}/${diy.body.id}`)).status,
    ).toBe(204);
    expect(
      (await as(e2e, h.fabien).get(monthUrl(h, NOV))).body.lines[0].categoryId,
    ).toBeNull();
  });
});
