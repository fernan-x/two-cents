import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { createBudget, seedMember } from '../support/budgets';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import { signUpUser } from '../support/users';

/** T030: migrations 0004/0005 (research R13) and the deferred Σ shares trigger (R6). */
describe('monthly planning migrations', () => {
  let e2e: E2eApp;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(() => e2e.reset());

  it('seeds the 10 default categories for a new budget', async () => {
    const owner = await signUpUser(e2e);
    const budget = await createBudget(e2e, owner);
    const rows = await e2e.db.execute<{ n: string }>(
      sql`SELECT count(*) AS n FROM budget_category WHERE budget_id = ${budget.id}`,
    );
    expect(Number(rows.rows[0].n)).toBe(10);
  });

  it('0005 turns 002 member_income rows into primary income lines', async () => {
    const owner = await signUpUser(e2e);
    const budget = await createBudget(e2e, owner);
    const membershipId = budget.members[0].membershipId;
    // Recreate the 002 table as it was, with one row, then run the 0005 body against it.
    await e2e.db.execute(sql`
      CREATE TABLE member_income (
        membership_id uuid NOT NULL, month_start date NOT NULL, amount_minor bigint NOT NULL,
        currency char(3) NOT NULL, updated_at timestamptz NOT NULL, updated_by uuid,
        PRIMARY KEY (membership_id, month_start))`);
    await e2e.db.execute(sql`
      INSERT INTO member_income VALUES (${membershipId}, '2026-10-01', 245050, 'EUR', now(), NULL)`);
    const body = readFileSync(
      join(__dirname, '../../drizzle/0005_migrate_member_income.sql'),
      'utf8',
    );
    for (const statement of body.split('--> statement-breakpoint'))
      if (statement.trim()) await e2e.db.execute(sql.raw(statement));

    const months = await e2e.db.execute<{
      period_start: string;
      period_end: string;
      created_from: string;
    }>(
      sql`SELECT period_start::text, period_end::text, created_from FROM budget_month WHERE budget_id = ${budget.id}`,
    );
    expect(months.rows).toEqual([
      {
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        created_from: 'income',
      },
    ]);
    const incomes = await e2e.db.execute<{
      amount_minor: string;
      is_primary: boolean;
      label: string | null;
    }>(
      sql`SELECT amount_minor::text, is_primary, label FROM income_line WHERE membership_id = ${membershipId}`,
    );
    expect(incomes.rows).toEqual([
      { amount_minor: '245050', is_primary: true, label: null },
    ]);
    const table = await e2e.db.execute(
      sql`SELECT to_regclass('member_income') AS t`,
    );
    expect(table.rows[0].t).toBeNull();
  });

  it('the deferred trigger refuses shares that do not add up to the total', async () => {
    const owner = await signUpUser(e2e);
    const partner = await signUpUser(e2e);
    const budget = await createBudget(e2e, owner);
    const a = budget.members[0].membershipId;
    const b = await seedMember(e2e, budget.id, partner, 'member');
    const monthId = randomUUID();
    const lineId = randomUUID();
    await e2e.db.execute(sql`
      INSERT INTO budget_month (id, budget_id, period_start, period_end, status, created_from, created_at)
      VALUES (${monthId}, ${budget.id}, '2026-11-01', '2026-11-30', 'draft', 'scratch', now())`);
    const insertLine = (total: number, shareB: number) =>
      e2e.db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO budget_line (id, month_id, budget_id, series_id, "group", label, split_mode, total_minor,
                                   currency, position, created_at, updated_at)
          VALUES (${lineId}, ${monthId}, ${budget.id}, ${randomUUID()}, 'recurring_shared', 'Courses', 'custom',
                  ${total}, 'EUR', 0, now(), now())`);
        await tx.execute(sql`
          INSERT INTO budget_line_share VALUES (${lineId}, ${a}, 10000), (${lineId}, ${b}, ${shareB})`);
      });
    await expect(insertLine(40000, 25000)).rejects.toThrow();
    await expect(insertLine(40000, 30000)).resolves.toBeUndefined();
  });
});
