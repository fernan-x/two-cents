import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  addLine,
  createMonth,
  seedHousehold,
  shared,
  type Household,
} from '../support/planning';

/** T032: migration 0007, the deferred Σ parts trigger and the payer/method checks (spec 004). */
describe('transaction tracking migration', () => {
  let e2e: E2eApp;
  let h: Household;
  let monthId: string;
  let lineId: string;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    await createMonth(e2e, h, '2026-11-01');
    const line = await addLine(
      e2e,
      h,
      h.fabien,
      '2026-11-01',
      shared('recurring_shared', 'Courses', { [h.m]: '10000', [h.f]: '30000' }),
    );
    lineId = line.lines.find(
      (l: { label: string }) => l.label === 'Courses',
    ).id;
    const rows = await e2e.db.execute<{ id: string }>(
      sql`SELECT id FROM budget_month WHERE budget_id = ${h.budgetId}`,
    );
    monthId = rows.rows[0].id;
  });

  const insertTxn = (
    id: string,
    amount: number,
    payer: string | null,
    method: string,
  ) =>
    sql`INSERT INTO txn (id, budget_id, month_id, date, amount_minor, currency, is_refund, label, label_normalized,
          payer_membership_id, payment_method, is_planned, origin, created_at, updated_at)
        VALUES (${id}, ${h.budgetId}, ${monthId}, '2026-11-10', ${amount}, 'EUR', ${amount < 0}, 'Leclerc', 'leclerc',
          ${payer}, ${method}, true, 'quick_add', now(), now())`;
  const insertPart = (txnId: string, amount: number, line: string | null) =>
    sql`INSERT INTO txn_part (id, txn_id, line_id, amount_minor, position) VALUES (${randomUUID()}, ${txnId}, ${line}, ${amount}, 0)`;

  it('accepts parts that add up and rejects a mismatch at commit', async () => {
    const ok = randomUUID();
    await e2e.db.transaction(async (tx) => {
      await tx.execute(insertTxn(ok, 12000, null, 'joint_card'));
      await tx.execute(insertPart(ok, 12000, lineId));
    });
    const bad = randomUUID();
    await expect(
      e2e.db.transaction(async (tx) => {
        await tx.execute(insertTxn(bad, 12000, null, 'joint_card'));
        await tx.execute(insertPart(bad, 11000, lineId));
      }),
    ).rejects.toThrow();
    const n = await e2e.db.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM txn`,
    );
    expect(Number(n.rows[0].n)).toBe(1);
  });

  it('accepts an unassigned transaction with no parts', async () => {
    await e2e.db.execute(insertTxn(randomUUID(), 500, h.f, 'cash'));
  });

  it('refuses a joint card with a member payer and a personal card for the joint account', async () => {
    await expect(
      e2e.db.execute(insertTxn(randomUUID(), 500, h.f, 'joint_card')),
    ).rejects.toThrow();
    await expect(
      e2e.db.execute(insertTxn(randomUUID(), 500, null, 'personal_card')),
    ).rejects.toThrow();
    await expect(
      e2e.db.execute(insertTxn(randomUUID(), 0, null, 'cash')),
    ).rejects.toThrow();
  });

  it('refuses a meal-voucher income counted toward the household', async () => {
    await expect(
      e2e.db
        .execute(sql`INSERT INTO income_line (id, month_id, membership_id, amount_minor, currency, counts_toward_household,
        is_meal_voucher, position, created_at, updated_at)
        VALUES (${randomUUID()}, ${monthId}, ${h.m}, 16000, 'EUR', true, true, 0, now(), now())`),
    ).rejects.toThrow();
  });

  it('nulls the part line when the budget line is deleted', async () => {
    const id = randomUUID();
    await e2e.db.transaction(async (tx) => {
      await tx.execute(insertTxn(id, 12000, null, 'joint_card'));
      await tx.execute(insertPart(id, 12000, lineId));
    });
    await e2e.db.execute(sql`DELETE FROM budget_line WHERE id = ${lineId}`);
    const parts = await e2e.db.execute<{ line_id: string | null }>(
      sql`SELECT line_id FROM txn_part WHERE txn_id = ${id}`,
    );
    expect(parts.rows).toEqual([{ line_id: null }]);
  });
});
