import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addLine,
  createMonth,
  type Household,
  monthUrl,
  seedHousehold,
  seedNovembre2026,
} from '../support/planning';
import { as } from '../support/users';

type Line = {
  id: string;
  seriesId: string;
  group: string;
  kind: string;
  label: string;
  splitMode: string | null;
  totalMinor: string;
  shares: Array<{ membershipId: string; amountMinor: string }>;
  position: number;
};

const shape = (l: Line) => ({
  seriesId: l.seriesId,
  group: l.group,
  kind: l.kind,
  label: l.label,
  splitMode: l.splitMode,
  totalMinor: l.totalMinor,
  shares: l.shares,
  position: l.position,
});

/** US2: start a new month from the previous one, a past month, a template or scratch. */
describe('US2 new month', () => {
  let e2e: E2eApp;
  let h: Household;
  const NOV = '2026-11-01';
  const DEC = '2026-12-01';

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
  });

  it('copies recurring lines, not one-off ones, and pre-fills incomes to confirm', async () => {
    await seedNovembre2026(e2e, h);
    const nov = (await as(e2e, h.fabien).get(monthUrl(h, NOV))).body;
    const dec = await createMonth(e2e, h, DEC, { kind: 'previous' });
    expect(dec.month).toMatchObject({
      start: DEC,
      status: 'draft',
      createdFrom: 'previous',
    });

    const recurring = (nov.lines as Line[]).filter(
      (l) => l.group !== 'one_off_shared',
    );
    expect(recurring).toHaveLength(19);
    expect((dec.lines as Line[]).map(shape)).toEqual(recurring.map(shape));
    expect(
      (dec.lines as Line[]).some((l) => l.label === 'Cadeaux de Noël'),
    ).toBe(false);

    expect(dec.incomes).toHaveLength(3);
    expect(dec.incomes.every((i: { toConfirm: boolean }) => i.toConfirm)).toBe(
      true,
    );
    expect(dec.flags.incomesToConfirm.sort()).toEqual([h.f, h.m].sort());
    const maelle = dec.summary.members.find(
      (m: { membershipId: string }) => m.membershipId === h.m,
    );
    expect(maelle).toMatchObject({
      countedIncomeMinor: '200000',
      dceMinor: '0',
      whatsLeftMinor: '26816',
    });

    const confirmed = await as(e2e, h.maelle).post(
      monthUrl(h, DEC, '/incomes/confirm'),
    );
    expect(confirmed.status).toBe(200);
    expect(confirmed.body.flags.incomesToConfirm).toEqual([h.f]);
  });

  it('needs an earlier month for "previous"', async () => {
    const res = await as(e2e, h.fabien).post(
      `/v1/budgets/${h.budgetId}/months`,
      {
        periodStart: NOV,
        source: { kind: 'previous' },
      },
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_MONTH');
  });

  it('fills a month that only holds an income from the 002 route', async () => {
    await seedNovembre2026(e2e, h);
    const put = await as(e2e, h.maelle).put(
      `/v1/budgets/${h.budgetId}/members/me/income/2026-10-01`,
      {
        amountMinor: '190000',
      },
    );
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ amountMinor: '190000', currency: 'EUR' });
    // October exists (from the income route) with no lines: creating it from November fills it.
    const oct = await createMonth(e2e, h, '2026-10-01', {
      kind: 'month',
      monthStart: NOV,
    });
    expect(oct.month.createdFrom).toBe('month');
    expect(oct.lines).toHaveLength(19);
    expect(
      oct.incomes.filter(
        (i: { membershipId: string }) => i.membershipId === h.m,
      ),
    ).toEqual([
      expect.objectContaining({ amountMinor: '190000', toConfirm: false }),
    ]);
  });

  it('duplicates a past month with its one-off lines when asked (US7)', async () => {
    await seedNovembre2026(e2e, h);
    const dec = await createMonth(e2e, h, DEC, {
      kind: 'month',
      monthStart: NOV,
      includeOneOff: true,
    });
    expect(dec.lines).toHaveLength(20);
    const gifts = dec.lines.find((l: Line) => l.label === 'Cadeaux de Noël');
    const novGifts = (
      await as(e2e, h.fabien).get(monthUrl(h, NOV))
    ).body.lines.find((l: Line) => l.label === 'Cadeaux de Noël');
    expect(gifts.seriesId).not.toBe(novGifts.seriesId);
  });

  it('saves, lists, renames, uses and deletes a template', async () => {
    await seedNovembre2026(e2e, h);
    const url = `/v1/budgets/${h.budgetId}/templates`;
    const created = await as(e2e, h.maelle).post(url, {
      name: 'Mois type',
      fromMonthStart: NOV,
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Mois type', lineCount: 20 });
    const dup = await as(e2e, h.fabien).post(url, {
      name: 'mois TYPE',
      fromMonthStart: NOV,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('TEMPLATE_NAME_TAKEN');

    const renamed = await as(e2e, h.fabien).patch(`${url}/${created.body.id}`, {
      name: 'Mois classique',
    });
    expect(renamed.body.name).toBe('Mois classique');
    expect((await as(e2e, h.victor).get(url)).body.templates).toHaveLength(1);

    const dec = await createMonth(e2e, h, DEC, {
      kind: 'template',
      templateId: created.body.id,
    });
    expect(dec.month.createdFrom).toBe('template');
    expect(dec.lines).toHaveLength(20);
    expect(dec.incomes).toEqual([]);

    expect(
      (await as(e2e, h.fabien).delete(`${url}/${created.body.id}`)).status,
    ).toBe(204);
    expect((await as(e2e, h.fabien).get(url)).body.templates).toEqual([]);
  });

  it("a template keeps only the saver's own private lines", async () => {
    await createMonth(e2e, h, NOV);
    await addLine(e2e, h, h.maelle, NOV, {
      group: 'personal',
      label: 'Psy',
      ownerMembershipId: h.m,
      isPrivate: true,
      amount: { entry: 'total', totalMinor: '6000' },
    });
    const url = `/v1/budgets/${h.budgetId}/templates`;
    const byFabien = await as(e2e, h.fabien).post(url, {
      name: 'Fabien',
      fromMonthStart: NOV,
    });
    expect(byFabien.body.lineCount).toBe(0);
    const byMaelle = await as(e2e, h.maelle).post(url, {
      name: 'Maëlle',
      fromMonthStart: NOV,
    });
    expect(byMaelle.body.lineCount).toBe(1);
  });
});
