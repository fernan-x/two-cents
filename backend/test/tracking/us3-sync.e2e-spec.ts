import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import { monthUrl, seedHousehold, type Household } from '../support/planning';
import {
  NOV,
  type NovemberLines,
  putTxn,
  recordTxn,
  seedNovemberLines,
  txnBody,
  txnUrl,
} from '../support/tracking';
import { as } from '../support/users';

/** T067: offline sync is exactly once and never loses a transaction (spec 004 US3, SC-004). */
describe('US3 sync', () => {
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

  it('stores 100 transactions once each when every one is sent twice concurrently', async () => {
    const bodies = Array.from({ length: 100 }, (_, i) => ({
      id: randomUUID(),
      body: txnBody({ amountMinor: String(100 + i), label: `Achat ${i}` }),
    }));
    for (let i = 0; i < bodies.length; i += 10) {
      await Promise.all(
        bodies
          .slice(i, i + 10)
          .flatMap(({ id, body }) => [
            putTxn(e2e, h, h.fabien, body, id),
            putTxn(e2e, h, h.fabien, body, id),
          ]),
      );
    }
    const n = await e2e.db.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM txn`,
    );
    expect(Number(n.rows[0].n)).toBe(100);
  });

  it('keeps a transaction whose line was deleted meanwhile, unassigned and flagged', async () => {
    const detail = (await as(e2e, h.fabien).get(monthUrl(h, NOV))).body;
    const maison = detail.lines.find((l: { id: string }) => l.id === L.maison);
    await as(e2e, h.fabien).delete(
      monthUrl(h, NOV, `/lines/${L.maison}?expectedVersion=${maison.version}`),
    );
    const { res } = await putTxn(
      e2e,
      h,
      h.maelle,
      txnBody({ parts: [{ lineId: L.maison, amountMinor: '4230' }] }),
    );
    expect(res.status).toBe(201);
    expect(res.body.parts[0]).toMatchObject({
      lineId: null,
      needsReview: true,
    });
  });

  it('answers month_closed when the month was closed meanwhile', async () => {
    await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
      action: 'activate',
    });
    await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
      action: 'close',
    });
    const { res } = await putTxn(e2e, h, h.maelle, txnBody());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('MONTH_CLOSED');
  });

  it('answers stale_state with the current transaction on a concurrent edit', async () => {
    const { id } = await recordTxn(e2e, h, h.fabien, txnBody());
    await as(e2e, h.maelle).patch(txnUrl(h, id), {
      expectedVersion: 1,
      label: 'Carrefour',
    });
    const late = await as(e2e, h.fabien).patch(txnUrl(h, id), {
      expectedVersion: 1,
      label: 'Lidl',
    });
    expect(late.status).toBe(409);
    expect(late.body).toMatchObject({
      error: 'STALE_STATE',
      current: { label: 'Carrefour', version: 2 },
    });
  });
});
