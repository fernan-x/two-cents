import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { MaterializeRecurring } from '../../src/tracking/application/use-cases/recurring';
import { RecurringJob } from '../../src/tracking/infrastructure/jobs/recurring.job';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  createMonth,
  monthUrl,
  seedHousehold,
  type Household,
} from '../support/planning';
import {
  NOV,
  type NovemberLines,
  recordTxn,
  seedNovemberLines,
  txnBody,
} from '../support/tracking';
import { as } from '../support/users';

/** T096 (US8 recurring), T103 (US9 CSV import). */
describe('recurring transactions and CSV import', () => {
  let e2e: E2eApp;
  let h: Household;
  let L: NovemberLines;
  let seriesOf: (lineId: string) => Promise<string>;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    L = await seedNovemberLines(e2e, h);
    seriesOf = async (lineId) =>
      (await as(e2e, h.fabien).get(monthUrl(h, NOV))).body.lines.find(
        (l: { id: string }) => l.id === lineId,
      ).seriesId;
  });

  const rulesUrl = () => `/v1/budgets/${h.budgetId}/recurring-transactions`;
  const txnRows = () =>
    e2e.db.execute<{
      date: string;
      origin: string;
      line_id: string | null;
      needs_review: boolean;
    }>(
      sql`SELECT t.date::text, t.origin, p.line_id, p.needs_review FROM txn t LEFT JOIN txn_part p ON p.txn_id = t.id ORDER BY t.date`,
    );

  describe('US8 recurring', () => {
    const rule = async (over: object = {}) => {
      const res = await as(e2e, h.fabien).post(rulesUrl(), {
        label: 'Loyer',
        amountMinor: '95000',
        dayOfMonth: 5,
        payer: { kind: 'joint' },
        paymentMethod: 'transfer',
        seriesId: await seriesOf(L.loyer),
        startsOn: '2026-11-01',
        ...over,
      });
      if (res.status !== 201) throw new Error(JSON.stringify(res.body));
      return res.body;
    };
    const job = () => e2e.app.get(RecurringJob).run();

    it('creates one transaction per due date, linked to the series, exactly once', async () => {
      const r = await rule();
      expect(r).toMatchObject({
        lineLabel: 'Loyer',
        active: true,
        nextOccurrence: '2026-12-05',
      });
      expect(await job()).toBe(1);
      expect(await job()).toBe(0);
      expect((await txnRows()).rows).toEqual([
        {
          date: '2026-11-05',
          origin: 'recurring',
          line_id: L.loyer,
          needs_review: false,
        },
      ]);
      const history = await e2e.db.execute<{ cause: string }>(
        sql`SELECT cause FROM month_change WHERE entity = 'transaction'`,
      );
      expect(history.rows).toEqual([{ cause: 'recurring' }]);
    });

    it('clamps day 31 to the last day and leaves future days alone', async () => {
      await rule({ dayOfMonth: 31 });
      expect(await job()).toBe(0); // 30 Nov is after "today" (16 Nov)
      e2e.clock.set('2026-11-30T09:00:00Z');
      expect(await job()).toBe(1);
      expect((await txnRows()).rows[0].date).toBe('2026-11-30');
    });

    it('creates missed occurrences when the month is created later, unassigned when the series is absent', async () => {
      await rule({ dayOfMonth: 2, startsOn: '2026-10-01' });
      await createMonth(e2e, h, '2026-10-01');
      // October has no Loyer series: created unassigned and flagged (FR-037).
      expect((await txnRows()).rows).toEqual([
        {
          date: '2026-10-02',
          origin: 'recurring',
          line_id: null,
          needs_review: true,
        },
      ]);
    });

    it('skips a closed month once, and pausing stops future occurrences', async () => {
      const r = await rule();
      await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
        action: 'activate',
      });
      await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
        action: 'close',
      });
      await job();
      await job();
      const skips = await e2e.db.execute<{ n: string }>(
        sql`SELECT count(*) AS n FROM recurring_skip`,
      );
      expect(Number(skips.rows[0].n)).toBe(1);
      expect((await txnRows()).rows).toEqual([]);

      // FR-020: rule changes are in the month history.
      const ruleHistory = await e2e.db.execute<{ action: string }>(
        sql`SELECT action FROM month_change WHERE entity = 'recurring_rule'`,
      );
      expect(ruleHistory.rows).toEqual([{ action: 'created' }]);
      const paused = await as(e2e, h.fabien).patch(`${rulesUrl()}/${r.id}`, {
        expectedVersion: 1,
        active: false,
      });
      expect(paused.body).toMatchObject({
        active: false,
        nextOccurrence: null,
      });
    });

    it('refuses a one-off series and another member personal series', async () => {
      const oneOff = await as(e2e, h.fabien).post(rulesUrl(), {
        label: 'Maison',
        amountMinor: '100',
        dayOfMonth: 1,
        payer: { kind: 'joint' },
        paymentMethod: 'transfer',
        seriesId: await seriesOf(L.maison),
        startsOn: '2026-11-01',
      });
      expect(oneOff.status).toBe(400);
      const theirs = await as(e2e, h.maelle).post(rulesUrl(), {
        label: 'Forfait',
        amountMinor: '100',
        dayOfMonth: 1,
        payer: { kind: 'joint' },
        paymentMethod: 'transfer',
        seriesId: await seriesOf(L.phoneF),
        startsOn: '2026-11-01',
      });
      expect(theirs.status).toBe(403);
    });

    it('is exposed for the job module', () => {
      expect(e2e.app.get(MaterializeRecurring)).toBeDefined();
    });
  });

  describe('US9 CSV import', () => {
    const importUrl = () => `/v1/budgets/${h.budgetId}/transaction-imports`;
    const row = (over: object = {}) => ({
      rowId: randomUUID(),
      importKey: `member:x|2026-11-12|10447|cb leclerc|${randomUUID()}`,
      date: '2026-11-12',
      amountMinor: '10447',
      label: 'CB LECLERC 12/11',
      parts: [],
      isPlanned: false,
      include: true,
      ...over,
    });

    it('flags duplicates and months in a dry run, saves nothing, then commits all included rows', async () => {
      await recordTxn(
        e2e,
        h,
        h.fabien,
        txnBody({
          date: '2026-11-13',
          amountMinor: '10447',
          payer: { kind: 'member', membershipId: h.f },
        }),
      );
      const rows = [
        row(),
        row({ amountMinor: '1999', importKey: 'k2', label: 'FREE' }),
        row({ date: '2026-12-02', importKey: 'k3' }),
      ];
      const dry = await as(e2e, h.fabien).post(importUrl(), {
        dryRun: true,
        account: { kind: 'member' },
        rows,
      });
      expect(dry.status).toBe(200);
      expect(
        dry.body.rows.map(
          (r: { duplicateOf: string | null; monthStatus: string }) => [
            !!r.duplicateOf,
            r.monthStatus,
          ],
        ),
      ).toEqual([
        [true, 'open'],
        [false, 'open'],
        [false, 'missing'],
      ]);
      const before = await e2e.db.execute<{ n: string }>(
        sql`SELECT count(*) AS n FROM txn`,
      );
      expect(Number(before.rows[0].n)).toBe(1);

      const refused = await as(e2e, h.fabien).post(importUrl(), {
        dryRun: false,
        account: { kind: 'member' },
        rows,
      });
      expect(refused.status).toBe(404);

      const commit = await as(e2e, h.fabien).post(importUrl(), {
        dryRun: false,
        account: { kind: 'member' },
        rows: [
          rows[0],
          {
            ...rows[1],
            parts: [{ lineId: L.courses, amountMinor: '1999' }],
            isPlanned: true,
          },
        ],
      });
      expect(commit.status).toBe(201);
      expect(commit.body.created).toBe(2);
      const again = await as(e2e, h.fabien).post(importUrl(), {
        dryRun: true,
        account: { kind: 'member' },
        rows: [rows[0], rows[1]],
      });
      expect(
        again.body.rows.map(
          (r: { alreadyImported: boolean }) => r.alreadyImported,
        ),
      ).toEqual([true, true]);
    });

    it('is all or nothing', async () => {
      const res = await as(e2e, h.fabien).post(importUrl(), {
        dryRun: false,
        account: { kind: 'joint' },
        rows: [
          row({ importKey: 'a' }),
          row({
            importKey: 'b',
            parts: [{ lineId: L.psy, amountMinor: '10447' }],
          }),
        ],
      });
      expect(res.status).toBe(403);
      const n = await e2e.db.execute<{ n: string }>(
        sql`SELECT count(*) AS n FROM txn`,
      );
      expect(Number(n.rows[0].n)).toBe(0);
    });

    it('handles closed months by batch choice and refuses reopening by a member', async () => {
      await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
        action: 'activate',
      });
      await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
        action: 'close',
      });
      const rows = [row({ importKey: 'c1' })];
      expect(
        (
          await as(e2e, h.maelle).post(importUrl(), {
            dryRun: false,
            account: { kind: 'joint' },
            rows,
          })
        ).status,
      ).toBe(400);
      expect(
        (
          await as(e2e, h.maelle).post(importUrl(), {
            dryRun: false,
            account: { kind: 'joint' },
            closedMonthAction: 'reopen',
            rows,
          })
        ).status,
      ).toBe(403);
      const skip = await as(e2e, h.maelle).post(importUrl(), {
        dryRun: false,
        account: { kind: 'joint' },
        closedMonthAction: 'skip',
        rows,
      });
      expect(skip.body.created).toBe(0);
      const reopen = await as(e2e, h.fabien).post(importUrl(), {
        dryRun: false,
        account: { kind: 'joint' },
        closedMonthAction: 'reopen',
        rows,
      });
      expect(reopen.body.created).toBe(1);
    });

    it('stores a CSV mapping per header fingerprint', async () => {
      const url = `/v1/budgets/${h.budgetId}/csv-mappings/${encodeURIComponent('date|libelle|debit|credit')}`;
      expect((await as(e2e, h.fabien).get(url)).status).toBe(404);
      const mapping = {
        delimiter: ';',
        encoding: 'windows-1252',
        dateColumn: 0,
        dateFormat: 'DD/MM/YYYY',
        labelColumns: [1],
        amountColumn: null,
        debitColumn: 2,
        creditColumn: 3,
        skipRows: 1,
      };
      expect((await as(e2e, h.fabien).put(url, mapping)).status).toBe(200);
      expect((await as(e2e, h.maelle).get(url)).body).toEqual(mapping);
    });
  });
});
