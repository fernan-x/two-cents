import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
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
  putTxn,
  seedNovemberLines,
  txnBody,
} from '../support/tracking';
import { as } from '../support/users';

/** T045: recording a transaction (spec 004 US1, FR-001–FR-010, research R3). */
describe('US1 record a transaction', () => {
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

  const quick = (over: object = {}) =>
    txnBody({
      payer: { kind: 'member', membershipId: h.f },
      parts: [{ lineId: L.courses, amountMinor: '4230' }],
      ...over,
    });

  it('creates with defaults: planned with a line, personal card for a member', async () => {
    const { res } = await putTxn(e2e, h, h.fabien, quick());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      private: false,
      monthStart: NOV,
      date: '2026-11-10',
      amountMinor: '4230',
      label: 'Leclerc',
      payer: { kind: 'member', membershipId: h.f },
      paymentMethod: 'personal_card',
      isPlanned: true,
      isShared: true,
      isRefund: false,
      version: 1,
      parts: [{ lineId: L.courses, amountMinor: '4230', needsReview: false }],
      can: { edit: true, delete: true },
    });
  });

  it('defaults to unplanned without a line, joint card for the joint account', async () => {
    const { res } = await putTxn(e2e, h, h.fabien, txnBody());
    expect(res.body).toMatchObject({
      isPlanned: false,
      isShared: false,
      paymentMethod: 'joint_card',
      parts: [],
    });
  });

  it('is idempotent on the client id and refuses a different body for the same id', async () => {
    const id = randomUUID();
    const first = await putTxn(e2e, h, h.fabien, quick(), id);
    const replay = await putTxn(e2e, h, h.fabien, quick(), id);
    expect(first.res.status).toBe(201);
    expect(replay.res.status).toBe(200);
    expect(replay.res.body.id).toBe(id);
    const n = await e2e.db.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM txn`,
    );
    expect(Number(n.rows[0].n)).toBe(1);
    const other = await putTxn(
      e2e,
      h,
      h.fabien,
      quick({ amountMinor: '999', parts: [] }),
      id,
    );
    expect(other.res.status).toBe(409);
    expect(other.res.body.error).toBe('ID_CONFLICT');
  });

  it('answers month_not_found with canCreate, and month_closed with canReopen', async () => {
    const missing = await putTxn(
      e2e,
      h,
      h.maelle,
      txnBody({ date: '2026-12-03' }),
    );
    expect(missing.res.status).toBe(404);
    expect(missing.res.body).toMatchObject({
      error: 'MONTH_NOT_FOUND',
      periodStart: '2026-12-01',
      canCreate: true,
    });

    await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
      action: 'activate',
    });
    await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
      action: 'close',
    });
    const closed = await putTxn(e2e, h, h.maelle, txnBody());
    expect(closed.res.status).toBe(409);
    expect(closed.res.body).toMatchObject({
      error: 'MONTH_CLOSED',
      monthStart: NOV,
      canReopen: false,
    });
    const owner = await putTxn(e2e, h, h.fabien, txnBody());
    expect(owner.res.body.canReopen).toBe(true);
  });

  it('refuses parts that do not add up, with the signed difference', async () => {
    const { res } = await putTxn(
      e2e,
      h,
      h.fabien,
      quick({
        amountMinor: '12000',
        parts: [
          { lineId: L.courses, amountMinor: '9000' },
          { lineId: L.maison, amountMinor: '2000' },
        ],
      }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({
      error: 'PARTS_MISMATCH',
      differenceMinor: '1000',
    });
  });

  it('refuses a line of another month and keeps a deleted line as unassigned', async () => {
    const oct = await createMonth(e2e, h, '2026-10-01');
    void oct;
    const otherMonthLine = await as(e2e, h.fabien).post(
      monthUrl(h, '2026-10-01', '/lines'),
      {
        group: 'one_off_shared',
        label: 'Vélo',
        amount: { entry: 'total', totalMinor: '4000' },
        split: { mode: 'equal' },
      },
    );
    const octLine = otherMonthLine.body.lines[0].id;
    const wrong = await putTxn(
      e2e,
      h,
      h.fabien,
      quick({ parts: [{ lineId: octLine, amountMinor: '4230' }] }),
    );
    expect(wrong.res.status).toBe(400);
    expect(wrong.res.body.error).toBe('LINE_NOT_IN_MONTH');

    const gone = await putTxn(
      e2e,
      h,
      h.fabien,
      quick({ parts: [{ lineId: randomUUID(), amountMinor: '4230' }] }),
    );
    expect(gone.res.status).toBe(201);
    expect(gone.res.body.parts).toEqual([
      expect.objectContaining({ lineId: null, needsReview: true }),
    ]);
  });

  it('refuses invalid payer and method combinations', async () => {
    const { res } = await putTxn(
      e2e,
      h,
      h.fabien,
      txnBody({ paymentMethod: 'personal_card' }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_PAYMENT_METHOD');
    const viewerPayer = await putTxn(
      e2e,
      h,
      h.fabien,
      txnBody({ payer: { kind: 'member', membershipId: h.v } }),
    );
    expect(viewerPayer.res.status).toBe(400);
  });

  it('refuses a transaction on another member personal line, and Viewers entirely', async () => {
    const { res } = await putTxn(
      e2e,
      h,
      h.fabien,
      quick({ parts: [{ lineId: L.psy, amountMinor: '4230' }] }),
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_LINE_OWNER');
    const viewer = await putTxn(e2e, h, h.victor, txnBody());
    expect(viewer.res.status).toBe(403);
  });

  it('bumps the month revision, writes history, and lists with ETag / 304', async () => {
    const before = (
      await as(e2e, h.maelle).get(monthUrl(h, NOV, '/transactions'))
    ).headers.etag;
    await putTxn(e2e, h, h.fabien, quick());
    const list = await as(e2e, h.maelle).get(monthUrl(h, NOV, '/transactions'));
    expect(list.status).toBe(200);
    expect(list.headers.etag).not.toBe(before);
    expect(list.body.transactions).toHaveLength(1);
    const again = await as(e2e, h.maelle)
      .get(monthUrl(h, NOV, '/transactions'))
      .set('If-None-Match', list.headers.etag);
    expect(again.status).toBe(304);
    const history = await e2e.db.execute<{ entity: string; action: string }>(
      sql`SELECT entity, action FROM month_change WHERE entity = 'transaction'`,
    );
    expect(history.rows).toEqual([
      { entity: 'transaction', action: 'created' },
    ]);
  });

  it('counts suggestion outcomes without label, amount or line', async () => {
    await putTxn(e2e, h, h.fabien, quick({ suggestion: 'kept' }));
    await putTxn(e2e, h, h.fabien, quick({ suggestion: 'changed' }));
    await putTxn(e2e, h, h.fabien, quick({ suggestion: 'kept' }));
    const rows = await e2e.db.execute<{ kept: number; changed: number }>(
      sql`SELECT kept, changed FROM suggestion_stat`,
    );
    expect(rows.rows).toEqual([{ kept: 2, changed: 1 }]);
  });
});
