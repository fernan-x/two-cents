import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { REDACTED_PATHS } from '../../src/shared-kernel/infrastructure/logging/logger.module';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import {
  createMonth,
  type Household,
  seedHousehold,
} from '../support/planning';

/** T118 / Principle III: no amount or label of a budget reaches the logs. */
describe('planning logs', () => {
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

  it('request logs keep neither the body nor the query string of planning routes', () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString());
        done();
      },
    });
    const logger = pino(
      { redact: { paths: REDACTED_PATHS, censor: '[redacted]' } },
      stream,
    );
    logger.info({
      req: {
        method: 'POST',
        url: `/v1/budgets/${h.budgetId}/months/2026-11-01/lines?expectedVersion=3`,
        body: { label: 'Psy', amount: { entry: 'total', totalMinor: '6000' } },
      },
    });
    const output = lines.join('');
    expect(output).not.toContain('Psy');
    expect(output).not.toContain('6000');
  });

  it('the shares trigger error names no amount', async () => {
    await createMonth(e2e, h, '2026-11-01');
    const [{ id: monthId }] = (
      await e2e.db.execute<{ id: string }>(
        sql`SELECT id FROM budget_month LIMIT 1`,
      )
    ).rows;
    const lineId = randomUUID();
    const error = await e2e.db
      .transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO budget_line (id, month_id, budget_id, series_id, "group", label, split_mode, total_minor,
                                   currency, position, created_at, updated_at)
          VALUES (${lineId}, ${monthId}, ${h.budgetId}, ${randomUUID()}, 'recurring_shared', 'Psy', 'custom',
                  987654, 'EUR', 0, now(), now())`);
        await tx.execute(
          sql`INSERT INTO budget_line_share VALUES (${lineId}, ${h.f}, 123)`,
        );
      })
      .catch((e: Error & { cause?: Error }) => e);
    const message = String(
      (error as { cause?: Error }).cause?.message ?? (error as Error).message,
    );
    expect(message).toContain('do not add up');
    expect(message).not.toContain('987654');
    expect(message).not.toContain('123');
    expect(message).not.toContain('Psy');
  });
});
