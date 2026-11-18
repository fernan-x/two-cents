import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  createMonth,
  monthUrl,
  seedHousehold,
  type Household,
} from '../support/planning';
import { NOV } from '../support/tracking';
import { as } from '../support/users';

const p95 = (ms: number[]) =>
  [...ms].sort((a, b) => a - b)[Math.floor(ms.length * 0.95) - 1];

/** T111: GET tracking with 80 lines and 300 transactions answers fast; the 304 path is cheap. */
describe('tracking performance', () => {
  let e2e: E2eApp;
  let h: Household;

  beforeAll(async () => {
    e2e = await createE2eApp();
    await e2e.reset();
    h = await seedHousehold(e2e);
    await createMonth(e2e, h, NOV);
    const [{ id: monthId }] = (
      await e2e.db.execute<{ id: string }>(
        sql`SELECT id FROM budget_month LIMIT 1`,
      )
    ).rows;
    // Seed directly: 80 shared lines, 300 transactions spread over them (the API path is tested elsewhere).
    const lineIds: string[] = [];
    await e2e.db.transaction(async (tx) => {
      for (let i = 0; i < 80; i++) {
        const id = randomUUID();
        lineIds.push(id);
        await tx.execute(sql`INSERT INTO budget_line (id, month_id, budget_id, series_id, "group", label, split_mode,
          total_minor, currency, position, is_envelope, created_at, updated_at)
          VALUES (${id}, ${monthId}, ${h.budgetId}, ${randomUUID()}, 'recurring_shared', ${`Ligne ${i}`}, 'custom',
          20000, 'EUR', ${i}, ${i % 4 === 0}, now(), now())`);
        await tx.execute(
          sql`INSERT INTO budget_line_share VALUES (${id}, ${h.f}, 10000), (${id}, ${h.m}, 10000)`,
        );
      }
      for (let i = 0; i < 300; i++) {
        const id = randomUUID();
        await tx.execute(sql`INSERT INTO txn (id, budget_id, month_id, date, amount_minor, currency, is_refund, label,
          label_normalized, payer_membership_id, payment_method, is_planned, origin, created_at, updated_at)
          VALUES (${id}, ${h.budgetId}, ${monthId}, '2026-11-10', ${1000 + i}, 'EUR', false, ${`Achat ${i}`},
          ${`achat ${i}`}, ${i % 2 ? h.f : h.m}, 'personal_card', true, 'quick_add', now(), now())`);
        await tx.execute(sql`INSERT INTO txn_part (id, txn_id, line_id, amount_minor, position)
          VALUES (${randomUUID()}, ${id}, ${lineIds[i % 80]}, ${1000 + i}, 0)`);
      }
    });
  });
  afterAll(() => e2e.close());

  it('GET tracking p95 < 300 ms and the 304 path p95 < 50 ms', async () => {
    const full: number[] = [];
    let etag = '';
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      const res = await as(e2e, h.fabien).get(monthUrl(h, NOV, '/tracking'));
      full.push(performance.now() - t0);
      expect(res.status).toBe(200);
      etag = res.headers.etag;
    }
    const cached: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t0 = performance.now();
      const res = await as(e2e, h.fabien)
        .get(monthUrl(h, NOV, '/tracking'))
        .set('If-None-Match', etag);
      cached.push(performance.now() - t0);
      expect(res.status).toBe(304);
    }
    expect(p95(full)).toBeLessThan(300);
    expect(p95(cached)).toBeLessThan(50);
  });
});
