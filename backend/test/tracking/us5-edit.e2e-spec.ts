import { sql } from 'drizzle-orm';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addLine,
  createMonth,
  monthUrl,
  seedHousehold,
  shared,
  type Household,
} from '../support/planning';
import {
  NOV,
  type NovemberLines,
  recordTxn,
  seedNovemberLines,
  txnBody,
  txnUrl,
} from '../support/tracking';
import { as } from '../support/users';

/** T078: editing and deleting transactions (spec 004 US5, edge cases). */
describe('US5 edit and delete', () => {
  let e2e: E2eApp;
  let h: Household;
  let L: NovemberLines;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    L = await seedNovemberLines(e2e, h);
  });

  const onCourses = () =>
    recordTxn(
      e2e,
      h,
      h.fabien,
      txnBody({ parts: [{ lineId: L.courses, amountMinor: '4230' }] }),
    );

  it('edits fields, keeps one part in step with the amount, and records history', async () => {
    const { id } = await onCourses();
    const res = await as(e2e, h.maelle).patch(txnUrl(h, id), {
      expectedVersion: 1,
      amountMinor: '5000',
      label: 'Carrefour',
      note: 'avec les piles',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      amountMinor: '5000',
      label: 'Carrefour',
      note: 'avec les piles',
      version: 2,
      parts: [{ lineId: L.courses, amountMinor: '5000' }],
    });
    const rows = await e2e.db.execute<{ action: string }>(
      sql`SELECT action FROM month_change WHERE entity = 'transaction' ORDER BY id`,
    );
    expect(rows.rows.map((r) => r.action)).toEqual(['created', 'updated']);
  });

  it('records a refund as a negative amount that lowers the line', async () => {
    await onCourses();
    await recordTxn(
      e2e,
      h,
      h.fabien,
      txnBody({
        amountMinor: '-2000',
        parts: [{ lineId: L.courses, amountMinor: '-2000' }],
      }),
    );
    const t = (await as(e2e, h.fabien).get(monthUrl(h, NOV, '/tracking'))).body;
    expect(
      t.lines.find((l: { lineId: string }) => l.lineId === L.courses).actual,
    ).toBe('2230');
  });

  it('splits across lines and reports the difference when parts do not add up', async () => {
    const { id } = await onCourses();
    const ok = await as(e2e, h.fabien).patch(txnUrl(h, id), {
      expectedVersion: 1,
      amountMinor: '12000',
      parts: [
        { lineId: L.courses, amountMinor: '9000' },
        { lineId: L.maison, amountMinor: '3000' },
      ],
    });
    expect(ok.status).toBe(200);
    const bad = await as(e2e, h.fabien).patch(txnUrl(h, id), {
      expectedVersion: 2,
      parts: [
        { lineId: L.courses, amountMinor: '9000' },
        { lineId: L.maison, amountMinor: '2000' },
      ],
    });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({
      error: 'PARTS_MISMATCH',
      differenceMinor: '1000',
    });
  });

  it('keeps a hand-set planned flag when the line changes', async () => {
    const { id } = await recordTxn(
      e2e,
      h,
      h.fabien,
      txnBody({
        isPlanned: false,
        parts: [{ lineId: L.courses, amountMinor: '4230' }],
      }),
    );
    const res = await as(e2e, h.fabien).patch(txnUrl(h, id), {
      expectedVersion: 1,
      parts: [{ lineId: L.maison, amountMinor: '4230' }],
    });
    expect(res.body.isPlanned).toBe(false);
  });

  it('moves to another open month by date, mapping the line by series', async () => {
    await createMonth(e2e, h, '2026-10-01');
    await addLine(
      e2e,
      h,
      h.fabien,
      '2026-10-01',
      shared('recurring_shared', 'Courses (oct)', {
        [h.m]: '100',
        [h.f]: '100',
      }),
    );
    const { id } = await onCourses();
    const res = await as(e2e, h.fabien).patch(txnUrl(h, id), {
      expectedVersion: 1,
      date: '2026-10-20',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      monthStart: '2026-10-01',
      date: '2026-10-20',
    });
    // Courses of November has no series in October here: unassigned and flagged.
    expect(res.body.parts[0]).toMatchObject({
      lineId: null,
      needsReview: true,
    });
    const nov = await as(e2e, h.fabien).get(monthUrl(h, NOV, '/transactions'));
    expect(nov.body.transactions).toHaveLength(0);
  });

  it('deletes idempotently, checks the version, and forbids others on a personal line', async () => {
    const { id } = await onCourses();
    expect(
      (await as(e2e, h.maelle).delete(`${txnUrl(h, id)}?expectedVersion=2`))
        .status,
    ).toBe(409);
    expect(
      (await as(e2e, h.maelle).delete(`${txnUrl(h, id)}?expectedVersion=1`))
        .status,
    ).toBe(204);
    expect(
      (await as(e2e, h.maelle).delete(`${txnUrl(h, id)}?expectedVersion=1`))
        .status,
    ).toBe(204);

    const phone = await recordTxn(
      e2e,
      h,
      h.fabien,
      txnBody({
        payer: { kind: 'member', membershipId: h.f },
        parts: [{ lineId: L.phoneF, amountMinor: '4230' }],
      }),
    );
    expect(
      (
        await as(e2e, h.maelle).patch(txnUrl(h, phone.id), {
          expectedVersion: 1,
          label: 'x',
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await as(e2e, h.maelle).delete(
          `${txnUrl(h, phone.id)}?expectedVersion=1`,
        )
      ).status,
    ).toBe(403);
  });

  it('unassigns transactions of a deleted line instead of deleting them (FR-045)', async () => {
    await recordTxn(
      e2e,
      h,
      h.fabien,
      txnBody({
        parts: [
          {
            lineId: L.animalerie,
            subItemId: L.croquettes,
            amountMinor: '3000',
          },
        ],
        amountMinor: '3000',
      }),
    );
    await recordTxn(
      e2e,
      h,
      h.fabien,
      txnBody({ parts: [{ lineId: L.animalerie, amountMinor: '4230' }] }),
    );
    const line = (
      await as(e2e, h.fabien).get(monthUrl(h, NOV))
    ).body.lines.find((l: { id: string }) => l.id === L.animalerie);
    await as(e2e, h.fabien).delete(
      monthUrl(
        h,
        NOV,
        `/lines/${L.animalerie}?expectedVersion=${line.version}`,
      ),
    );
    const list = (
      await as(e2e, h.fabien).get(monthUrl(h, NOV, '/transactions'))
    ).body.transactions;
    expect(list).toHaveLength(2);
    for (const t of list)
      expect(t.parts).toEqual([
        expect.objectContaining({
          lineId: null,
          subItemId: null,
          needsReview: true,
        }),
      ]);
  });
});
