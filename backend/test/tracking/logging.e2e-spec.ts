import { Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import pino from 'pino';
import { REDACTED_PATHS } from '../../src/shared-kernel/infrastructure/logging/logger.module';
import { PUSH_SENDER } from '../../src/shared-kernel/application/ports';
import { RecurringJob } from '../../src/tracking/infrastructure/jobs/recurring.job';
import { createE2eApp, type E2eApp } from '../support/e2e-app';
import { monthUrl, seedHousehold, type Household } from '../support/planning';
import { NOV, seedNovemberLines } from '../support/tracking';
import { as } from '../support/users';

/** T110 / FR-050: no amount, label or note of a transaction reaches logs or push messages. */
describe('tracking logs and push', () => {
  let e2e: E2eApp;
  let h: Household;

  beforeAll(async () => {
    e2e = await createE2eApp();
  });
  afterAll(() => e2e.close());
  beforeEach(async () => {
    await e2e.reset();
    h = await seedHousehold(e2e);
    await seedNovemberLines(e2e, h);
  });

  it('request logs keep neither the body nor the query string of tracking routes', () => {
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
        method: 'PUT',
        url: `/v1/budgets/${h.budgetId}/transactions/${randomUUID()}?expectedVersion=3`,
        body: { label: 'Pharmacie', amountMinor: '7317', note: 'ordonnance' },
      },
    });
    const output = lines.join('');
    for (const secret of ['Pharmacie', '7317', 'ordonnance'])
      expect(output).not.toContain(secret);
  });

  it('the parts trigger error names no amount or label', async () => {
    const [{ id: monthId }] = (
      await e2e.db.execute<{ id: string }>(
        sql`SELECT id FROM budget_month LIMIT 1`,
      )
    ).rows;
    const id = randomUUID();
    const error = await e2e.db
      .transaction(async (tx) => {
        await tx.execute(sql`INSERT INTO txn (id, budget_id, month_id, date, amount_minor, currency, is_refund, label,
          label_normalized, payment_method, is_planned, origin, created_at, updated_at)
          VALUES (${id}, ${h.budgetId}, ${monthId}, '2026-11-10', 987654, 'EUR', false, 'Pharmacie', 'pharmacie',
          'joint_card', false, 'quick_add', now(), now())`);
        await tx.execute(
          sql`INSERT INTO txn_part (id, txn_id, amount_minor, position) VALUES (${randomUUID()}, ${id}, 123, 0)`,
        );
      })
      .catch((e: Error & { cause?: Error }) => e);
    const message = String(
      (error as { cause?: Error }).cause?.message ?? (error as Error).message,
    );
    expect(message).toContain('do not add up');
    for (const secret of ['987654', '123', 'Pharmacie'])
      expect(message).not.toContain(secret);
  });

  it('the skipped-recurring push names no label or amount', async () => {
    const sent: { title: string; body: string }[] = [];
    const sender = e2e.app.get<{
      send: (m: { title: string; body: string }[]) => Promise<void>;
    }>(PUSH_SENDER);
    const original = sender.send.bind(sender);
    sender.send = (messages) => {
      sent.push(...messages);
      return original(messages);
    };
    const courses = (
      await as(e2e, h.fabien).get(monthUrl(h, NOV))
    ).body.lines.find((l: { label: string }) => l.label === 'Loyer');
    await as(e2e, h.fabien).post(
      `/v1/budgets/${h.budgetId}/recurring-transactions`,
      {
        label: 'Loyer secret',
        amountMinor: '95123',
        dayOfMonth: 5,
        payer: { kind: 'joint' },
        paymentMethod: 'transfer',
        seriesId: courses.seriesId,
        startsOn: '2026-11-01',
      },
    );
    await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
      action: 'activate',
    });
    await as(e2e, h.fabien).post(monthUrl(h, NOV, '/status'), {
      action: 'close',
    });
    await e2e.app.get(RecurringJob).run();
    const all = JSON.stringify(sent);
    expect(all).not.toContain('Loyer secret');
    expect(all).not.toContain('95123');
    expect(all).not.toContain('951,23');
  });
});
