import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addLine,
  createMonth,
  type Household,
  monthUrl,
  personal,
  seedHousehold,
  seedNovembre2026,
  shared,
} from '../support/planning';
import { as } from '../support/users';

/** US1: plan a month and see what each member has left (spec 003). */
describe('US1 plan a month', () => {
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
  });

  it('creates an empty Draft month, once', async () => {
    const month = await createMonth(e2e, h, NOV);
    expect(month.month).toMatchObject({
      start: NOV,
      end: '2026-11-30',
      status: 'draft',
      createdFrom: 'scratch',
    });
    expect(
      month.members.map((m: { membershipId: string }) => m.membershipId),
    ).toEqual([h.f, h.m]);
    expect(month.lines).toEqual([]);
    await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'Loyer', { [h.f]: '100' }),
    );
    const again = await as(e2e, h.fabien).post(
      `/v1/budgets/${h.budgetId}/months`,
      {
        periodStart: NOV,
        source: { kind: 'scratch' },
      },
    );
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('MONTH_EXISTS');
  });

  it('refuses a period that is not a month start or is beyond next month', async () => {
    for (const periodStart of ['2026-11-02', '2027-01-01']) {
      const res = await as(e2e, h.fabien).post(
        `/v1/budgets/${h.budgetId}/months`,
        {
          periodStart,
          source: { kind: 'scratch' },
        },
      );
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_MONTH');
    }
    await createMonth(e2e, h, '2026-12-01'); // next month is allowed
    await createMonth(e2e, h, '2025-06-01'); // past months are allowed
  });

  it('computes the Novembre 2026 example exactly (SC-003)', async () => {
    await seedNovembre2026(e2e, h);
    const res = await as(e2e, h.maelle).get(monthUrl(h, NOV));
    expect(res.status).toBe(200);
    const byId = Object.fromEntries(
      res.body.summary.members.map((m: { membershipId: string }) => [
        m.membershipId,
        m,
      ]),
    );
    expect(byId[h.m]).toMatchObject({
      countedIncomeMinor: '200000',
      diMinor: '14432',
      dcrMinor: '158752',
      dceMinor: '27500',
      whatsLeftMinor: '-684',
      transferMinor: '186252',
      savingsMinor: '28192',
      savingsRatePermille: 141,
      overrun: true,
    });
    expect(byId[h.f]).toMatchObject({
      countedIncomeMinor: '299000',
      otherIncomeMinor: '16000',
      diMinor: '58932',
      dcrMinor: '196752',
      dceMinor: '27500',
      whatsLeftMinor: '15816',
      transferMinor: '224252',
      overrun: false,
    });
    expect(res.body.summary.household).toMatchObject({
      plannedMinor: '483868',
      whatsLeftMinor: '15132',
    });
    expect(res.body.lines).toHaveLength(20);
  });

  it('rejects amounts that are not integer minor units or exceed the limit', async () => {
    await createMonth(e2e, h, NOV);
    const text = await as(e2e, h.maelle).post(monthUrl(h, NOV, '/incomes'), {
      amountMinor: '12,5',
    });
    expect(text.status).toBe(400);
    expect(text.body.error).toBe('VALIDATION_FAILED');
    const tooLarge = await as(e2e, h.fabien).post(
      monthUrl(h, NOV, '/lines'),
      personal(h.f, 'Voiture', '100000001'),
    );
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.body.error).toBe('AMOUNT_TOO_LARGE');
  });

  it('refuses shares that do not add up to an entered total, with the difference', async () => {
    await createMonth(e2e, h, NOV);
    const res = await as(e2e, h.fabien).post(monthUrl(h, NOV, '/lines'), {
      group: 'recurring_shared',
      label: 'Courses',
      amount: {
        entry: 'shares',
        totalMinor: '40000',
        shares: [
          { membershipId: h.m, amountMinor: '10000' },
          { membershipId: h.f, amountMinor: '25000' },
        ],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'SPLIT_MISMATCH',
      differenceMinor: '5000',
    });
  });

  it('only the owner writes a personal line or an income', async () => {
    await createMonth(e2e, h, NOV);
    const forOther = await as(e2e, h.maelle).post(
      monthUrl(h, NOV, '/lines'),
      personal(h.f, 'x', '100'),
    );
    expect(forOther.status).toBe(403);
    expect(forOther.body.error).toBe('NOT_LINE_OWNER');

    const detail = await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      personal(h.f, 'Escalade', '5500'),
    );
    const line = detail.lines[0];
    expect(line.editable).toBe(true);
    const mView = await as(e2e, h.maelle).get(monthUrl(h, NOV));
    expect(mView.body.lines[0].editable).toBe(false);
    const edit = await as(e2e, h.maelle).patch(
      monthUrl(h, NOV, `/lines/${line.id}`),
      {
        expectedVersion: line.version,
        label: 'Hack',
      },
    );
    expect(edit.status).toBe(403);
    expect(edit.body.error).toBe('NOT_LINE_OWNER');

    const inc = await as(e2e, h.fabien).post(monthUrl(h, NOV, '/incomes'), {
      amountMinor: '299000',
    });
    const income = inc.body.incomes[0];
    const other = await as(e2e, h.maelle).patch(
      monthUrl(h, NOV, `/incomes/${income.id}`),
      {
        expectedVersion: income.version,
        amountMinor: '1',
      },
    );
    expect(other.status).toBe(403);
    expect(other.body.error).toBe('NOT_INCOME_OWNER');
  });

  it('a viewer reads but cannot write; an outsider gets 404', async () => {
    await createMonth(e2e, h, NOV);
    expect((await as(e2e, h.victor).get(monthUrl(h, NOV))).status).toBe(200);
    const write = await as(e2e, h.victor).post(
      monthUrl(h, NOV, '/lines'),
      shared('recurring_shared', 'x', { [h.f]: '1' }),
    );
    expect(write.status).toBe(403);
    const outsider = await as(e2e, h.olivia).get(monthUrl(h, NOV));
    expect(outsider.status).toBe(404);
    expect(outsider.body.error).toBe('BUDGET_NOT_FOUND');
    const missing = await as(e2e, h.fabien).get(monthUrl(h, '2026-10-01'));
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('MONTH_NOT_FOUND');
  });

  it('records each change in the month history (FR-035)', async () => {
    await createMonth(e2e, h, NOV);
    const detail = await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'Courses', { [h.m]: '10000', [h.f]: '18000' }),
    );
    const line = detail.lines[0];
    const res = await as(e2e, h.fabien).patch(
      monthUrl(h, NOV, `/lines/${line.id}`),
      {
        expectedVersion: line.version,
        scope: 'this_month_only',
        amount: {
          entry: 'shares',
          shares: [
            { membershipId: h.m, amountMinor: '10000' },
            { membershipId: h.f, amountMinor: '20000' },
          ],
        },
      },
    );
    expect(res.status).toBe(200);
    expect(res.body.lines[0]).toMatchObject({
      totalMinor: '30000',
      version: line.version + 1,
    });
    const rows = await e2e.db.execute<{
      action: string;
      changes: Array<{ field: string; old: string; new: string }>;
    }>(
      `SELECT action, changes FROM month_change WHERE entity = 'line' ORDER BY id`,
    );
    expect(rows.rows.map((r) => r.action)).toEqual(['created', 'updated']);
    expect(rows.rows[1].changes).toEqual(
      expect.arrayContaining([
        { field: 'totalMinor', old: '28000', new: '30000' },
        { field: `share:${h.f}`, old: '18000', new: '20000' },
      ]),
    );
  });

  it('reorders lines within a section and deletes a line', async () => {
    await createMonth(e2e, h, NOV);
    await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'A', { [h.f]: '1' }),
    );
    const two = await addLine(
      e2e,
      h,
      h.fabien,
      NOV,
      shared('recurring_shared', 'B', { [h.f]: '2' }),
    );
    const [a, b] = two.lines;
    const reordered = await as(e2e, h.maelle).put(
      monthUrl(h, NOV, '/lines/order'),
      {
        group: 'recurring_shared',
        lineIds: [b.id, a.id],
      },
    );
    expect(reordered.status).toBe(200);
    expect(reordered.body.lines.map((l: { label: string }) => l.label)).toEqual(
      ['B', 'A'],
    );
    const del = await as(e2e, h.maelle).delete(
      monthUrl(
        h,
        NOV,
        `/lines/${a.id}?expectedVersion=${reordered.body.lines[1].version}`,
      ),
    );
    expect(del.status).toBe(200);
    expect(del.body.lines.map((l: { label: string }) => l.label)).toEqual([
      'B',
    ]);
  });
});
