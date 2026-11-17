import { sql } from 'drizzle-orm';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  createMonth,
  type Household,
  monthUrl,
  seedHousehold,
} from '../support/planning';
import { as } from '../support/users';

/** US8: spreadsheet import, dry run then all-or-nothing commit (FR-039–FR-043, research R16). */
describe('US8 import', () => {
  let e2e: E2eApp;
  let h: Household;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
  });

  const url = () => `/v1/budgets/${h.budgetId}/imports`;
  const month = (periodStart: string, extraLines: object[] = []) => ({
    periodStart,
    incomes: [
      {
        membershipId: h.m,
        label: 'Salaire',
        amountMinor: '200000',
        countsTowardHousehold: true,
      },
      {
        membershipId: h.f,
        label: 'Salaire',
        amountMinor: '299000',
        countsTowardHousehold: true,
      },
    ],
    lines: [
      {
        group: 'personal',
        label: 'Spotify',
        ownerMembershipId: h.m,
        amount: { entry: 'total', totalMinor: '1250' },
      },
      {
        group: 'recurring_shared',
        label: 'Loyer',
        split: { mode: 'custom' },
        amount: {
          entry: 'shares',
          shares: [
            { membershipId: h.m, amountMinor: '95000' },
            { membershipId: h.f, amountMinor: '95000' },
          ],
        },
      },
      ...extraLines,
    ],
  });

  it('previews without writing: summaries, statuses, conflicts and issues', async () => {
    await createMonth(e2e, h, '2026-11-01');
    const badLine = {
      group: 'recurring_shared',
      label: 'Courses',
      split: { mode: 'custom' },
      amount: {
        entry: 'shares',
        totalMinor: '40000',
        shares: [{ membershipId: h.m, amountMinor: '10000' }],
      },
    };
    const res = await as(e2e, h.maelle).post(url(), {
      dryRun: true,
      months: [
        month('2026-09-01'),
        month('2026-10-01', [badLine]),
        month('2026-11-01'),
      ],
    });
    expect(res.status).toBe(200);
    expect(
      res.body.months.map(
        (m: {
          periodStart: string;
          status: string;
          conflict: string | null;
        }) => [m.periodStart, m.status, m.conflict],
      ),
    ).toEqual([
      ['2026-09-01', 'closed', null],
      ['2026-10-01', 'closed', null],
      ['2026-11-01', 'draft', 'exists'],
    ]);
    expect(res.body.months[1].issues).toEqual([
      { lineIndex: 2, code: 'SPLIT_MISMATCH' },
    ]);
    const sept = res.body.months[0].summary.members.find(
      (m: { membershipId: string }) => m.membershipId === h.m,
    );
    expect(sept).toMatchObject({
      diMinor: '1250',
      dcrMinor: '95000',
      whatsLeftMinor: '103750',
    });
    const count = await e2e.db.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM budget_month`,
    );
    expect(Number(count.rows[0].n)).toBe(1);
  });

  it('refuses to commit while a month conflicts or has issues', async () => {
    await createMonth(e2e, h, '2026-11-01');
    const res = await as(e2e, h.maelle).post(url(), {
      dryRun: false,
      months: [month('2026-10-01'), month('2026-11-01')],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('IMPORT_INVALID');
    expect(res.body.preview.months[1].conflict).toBe('exists');
    expect(
      (await as(e2e, h.fabien).get(monthUrl(h, '2026-10-01'))).status,
    ).toBe(404);
  });

  it('commits every month at once; past months are closed with their summary', async () => {
    const res = await as(e2e, h.maelle).post(url(), {
      dryRun: false,
      months: [month('2026-09-01'), month('2026-10-01'), month('2026-12-01')],
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      created: ['2026-09-01', '2026-10-01', '2026-12-01'],
    });
    const sept = (await as(e2e, h.fabien).get(monthUrl(h, '2026-09-01'))).body;
    expect(sept.month).toMatchObject({
      status: 'closed',
      createdFrom: 'import',
    });
    expect(sept.lines).toHaveLength(2);
    expect(
      sept.summary.members.find(
        (m: { membershipId: string }) => m.membershipId === h.m,
      ).whatsLeftMinor,
    ).toBe('103750');
    const dec = (await as(e2e, h.fabien).get(monthUrl(h, '2026-12-01'))).body;
    expect(dec.month.status).toBe('draft');
    const history = await as(e2e, h.fabien).get(
      monthUrl(h, '2026-09-01', '/history?all=true'),
    );
    expect(history.body.changes[0]).toMatchObject({
      cause: 'import',
      entity: 'month',
      action: 'created',
    });
  });

  it('is all or nothing when a month fails at write time', async () => {
    // Make the third month collide right before the commit writes it.
    await e2e.db.execute(sql`
      CREATE FUNCTION fail_dec() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.period_start = '2026-12-01' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END; $$`);
    await e2e.db.execute(
      sql`CREATE TRIGGER fail_dec BEFORE INSERT ON budget_month FOR EACH ROW EXECUTE FUNCTION fail_dec()`,
    );
    try {
      const res = await as(e2e, h.maelle).post(url(), {
        dryRun: false,
        months: [month('2026-09-01'), month('2026-10-01'), month('2026-12-01')],
      });
      expect(res.status).toBe(500);
      const count = await e2e.db.execute<{ n: string }>(
        sql`SELECT count(*) AS n FROM budget_month`,
      );
      expect(Number(count.rows[0].n)).toBe(0);
    } finally {
      await e2e.db.execute(sql`DROP TRIGGER fail_dec ON budget_month`);
      await e2e.db.execute(sql`DROP FUNCTION fail_dec()`);
    }
  });

  it('accepts at most 36 months per request', async () => {
    const months = Array.from({ length: 37 }, (_, i) =>
      month(new Date(Date.UTC(2023, i, 1)).toISOString().slice(0, 10)),
    );
    const res = await as(e2e, h.maelle).post(url(), { dryRun: true, months });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_FAILED');
  });
});
